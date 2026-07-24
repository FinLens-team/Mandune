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

function isIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function marketEvidenceId(lineId: string, date: string): string {
  return `panda-market-${lineId}-${date}`;
}

function baseLimitations(date: string): string[] {
  return [
    "PandaAI runtime acceptance does not declare price, volume, or amount units; unit remains unknown.",
    `PandaAI returned trading date ${date} without a clock time; the observation time preserves that date-only precision.`,
  ];
}

export function normalizePandaMarketRows(
  request: MarketEvidenceRequest,
  rows: readonly PandaMarketRow[],
): EvidenceRecord[] {
  return rows.map((row, index) => {
    if (!isIsoDate(row.date)) {
      return {
        id: marketEvidenceId(request.lineId, `invalid-date-${index}`),
        scope: { kind: "asset", line_id: request.lineId, symbol: request.symbol },
        metric_or_event_type: "close",
        value: null,
        source: {
          name: "PandaAI get_market_data",
          locator: `pandaai:get_market_data:${request.symbol}:invalid-date-${index}`,
        },
        observation_or_event_time: request.latestCompleteTradingDay,
        fetched_at: request.acquiredAt,
        status: "ambiguous" as const,
        limitations: [
          "PandaAI returned a market-data row with an invalid trading date; no market observation was accepted.",
        ],
        provenance: "observed" as const,
      };
    }

    const hasClose = typeof row.close === "number" && Number.isFinite(row.close);
    // Runtime acceptance has not established the close unit. Preserve the
    // observed value, but do not promote it to material analysis evidence.
    const status: EvidenceStatus = "ambiguous";

    return {
      id: marketEvidenceId(request.lineId, row.date),
      scope: { kind: "asset", line_id: request.lineId, symbol: request.symbol },
      metric_or_event_type: "close",
      value: hasClose ? row.close : null,
      source: {
        name: "PandaAI get_market_data",
        locator: `pandaai:get_market_data:${request.symbol}:${row.date}`,
      },
      observation_or_event_time: row.date,
      fetched_at: request.acquiredAt,
      status,
      limitations: hasClose
        ? ["The close value cannot support material analysis until its unit is verified.", ...baseLimitations(row.date)]
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
    observation_or_event_time: request.latestCompleteTradingDay,
    fetched_at: request.acquiredAt,
    status,
    limitations: [limitation],
    provenance: "observed",
  };
}
