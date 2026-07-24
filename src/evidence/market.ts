import type { AssetClass, EvidenceRecord, EvidenceStatus } from "../contracts/index.js";

export interface PandaMarketRow {
  date: string;
  close?: number | null;
}

export interface MarketEvidenceRequest {
  lineId: string;
  assetClass: AssetClass;
  symbol: string;
  acquiredAt: string;
  latestCompleteTradingDay: string;
}

const SHANGHAI_OFFSET = "+08:00";

function tradingDayTimestamp(date: string): string {
  return `${date}T00:00:00${SHANGHAI_OFFSET}`;
}

function marketEvidenceId(lineId: string, date: string): string {
  return `panda-market-${lineId}-${date}`;
}

function baseLimitations(date: string): string[] {
  return [
    "PandaAI runtime acceptance does not declare price, volume, or amount units; unit remains unknown.",
    `PandaAI returned trading date ${date} without a clock time; the normalized timestamp only preserves date granularity.`,
  ];
}

export function normalizePandaMarketRows(
  request: MarketEvidenceRequest,
  rows: readonly PandaMarketRow[],
): EvidenceRecord[] {
  return rows.map((row) => {
    const hasClose = typeof row.close === "number" && Number.isFinite(row.close);
    const status: EvidenceStatus = hasClose ? "available" : "ambiguous";

    return {
      id: marketEvidenceId(request.lineId, row.date),
      scope: { kind: "asset", line_id: request.lineId, symbol: request.symbol },
      metric_or_event_type: "close",
      value: hasClose ? row.close : null,
      source: {
        name: "PandaAI get_market_data",
        locator: `pandaai:get_market_data:${request.symbol}:${row.date}`,
      },
      observation_or_event_time: tradingDayTimestamp(row.date),
      fetched_at: request.acquiredAt,
      status,
      limitations: hasClose
        ? baseLimitations(row.date)
        : ["PandaAI returned a row without a usable close value.", ...baseLimitations(row.date)],
      provenance: "observed",
    };
  });
}

export function unavailableMarketEvidence(
  request: MarketEvidenceRequest,
  status: EvidenceStatus,
  limitation: string,
): EvidenceRecord {
  return {
    id: marketEvidenceId(request.lineId, request.latestCompleteTradingDay),
    scope: { kind: "asset", line_id: request.lineId, symbol: request.symbol },
    metric_or_event_type: "close",
    value: null,
    source: {
      name: "PandaAI get_market_data",
      locator: `pandaai:get_market_data:${request.symbol}`,
    },
    observation_or_event_time: tradingDayTimestamp(request.latestCompleteTradingDay),
    fetched_at: request.acquiredAt,
    status,
    limitations: [limitation],
    provenance: "observed",
  };
}
