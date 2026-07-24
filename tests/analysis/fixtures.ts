import { CONTRACTS_VERSION, type EvidenceRecord, type PortfolioSnapshot } from "../../src/contracts/index.js";

export const STARTED_AT = "2026-07-25T01:00:00.000Z";
export const TRADING_DAY = "2026-07-24";
export const CUTOFF_AT = "2026-07-25T00:00:00.000Z";

export function snapshot(lineCount = 2): PortfolioSnapshot {
  return {
    snapshot_id: "snapshot-analysis-test",
    created_at: "2026-07-24T23:00:00.000Z",
    contracts_version: CONTRACTS_VERSION,
    theme_id: "eastern_observation",
    lines: Array.from({ length: lineCount }, (_, index) => ({
      line_id: `line-${index + 1}`,
      asset_class: index === 0 ? "a_share" : "etf",
      name: index === 0 ? "虚构甲公司" : "虚构宽基 ETF",
      symbol: index === 0 ? "000001.SZ" : "510300.SH",
      market: index === 0 ? "SZ" : "SH",
      size_basis: index === 0 ? "60%" : "40%",
      observation_date: TRADING_DAY,
      entry_method: "example",
      confirmed_at: "2026-07-24T23:00:00.000Z",
    })),
    constraints: {
      investment_horizon: "长期",
      near_term_liquidity: "低",
      tolerable_drawdown: "中等",
      investment_objective: "长期增长",
    },
  };
}

export function marketEvidence(lineId: string, status: EvidenceRecord["status"] = "available"): EvidenceRecord {
  return {
    id: `market-${lineId}`,
    scope: { kind: "asset", line_id: lineId },
    metric_or_event_type: "close",
    value: status === "available" ? 10.5 : null,
    unit: "CNY",
    source: { name: "Test market source", locator: `test:${lineId}` },
    observation_or_event_time: TRADING_DAY,
    fetched_at: STARTED_AT,
    status,
    limitations: status === "available" ? [] : [`fixture ${status}`],
    provenance: "observed",
  };
}
