import { describe, expect, it, vi } from "vitest";
import type {
  HistoryReadResult,
  HistoryRecordV1,
  HistorySummary,
} from "../../src/history/index.js";
import {
  formatHistoryDateTime,
  historyRecordBoundary,
  loadHistoryEntries,
  type HistoryReader,
} from "../../src/features/history-view/model.js";

const summary: HistorySummary = {
  analysis_id: "analysis-history-1",
  analysis_completed_at: "2026-07-25T08:30:00.000Z",
  evidence_cutoff_at: "2026-07-25T08:00:00.000Z",
  narrative_status: "available",
  readability: "readable",
  record_id: "analysis-history-1",
  result_status: "limited",
  snapshot_id: "snapshot-history-1",
  theme_id: "eastern_observation",
  versions: {
    contracts: "1.0.0",
    history_schema: "analysis-history.v1",
    rational_analysis: "rational-analysis.v1",
    theme_narrative: "theme-narrative.v1",
  },
};

function record(sourceName = "fixture-structured"): HistoryRecordV1 {
  return {
    analysis: {
      advice: [],
      analysis_completed_at: summary.analysis_completed_at,
      analysis_id: summary.analysis_id,
      analysis_started_at: "2026-07-25T08:00:00.000Z",
      assumptions: [],
      conclusions: [],
      constraints: {
        investment_horizon: "长期",
        investment_objective: "长期增长",
        near_term_liquidity: "unknown",
        tolerable_drawdown: "中等",
      },
      contracts_version: "1.0.0",
      coverage: {
        covered_line_ids: ["line-history-1"],
        missing_metrics: [],
        uncovered_line_ids: [],
        unsupported_line_ids: [],
      },
      derived: [],
      evidence: [{
        fetched_at: "2026-07-25T07:55:00.000Z",
        id: "evidence-history-1",
        limitations: [],
        metric_or_event_type: "close",
        observation_or_event_time: "2026-07-24",
        provenance: "observed",
        scope: { kind: "asset", line_id: "line-history-1", symbol: "510300.SH" },
        source: { locator: "fixture://history/close", name: sourceName },
        status: "available",
        unit: "CNY",
        value: "示例观察",
      }],
      evidence_cutoff_at: summary.evidence_cutoff_at,
      latest_complete_trading_day: "2026-07-24",
      limitations: [],
      risk_notes: [],
      snapshot_id: summary.snapshot_id,
      status: "limited",
      theme_id: "eastern_observation",
      unknowns: [],
    },
    narrative: {
      advice_ids: [],
      body_paragraphs: ["示例叙事"],
      conclusion_ids: [],
      guidance_summary: "继续观察",
      headline: "今日观象",
      mascot_mood: "calm",
      rational_analysis_id: summary.analysis_id,
      schema_version: "theme-narrative.v1",
      theme_id: "eastern_observation",
    },
    rational_analysis_version: "rational-analysis.v1",
    record_id: summary.record_id,
    schema_version: "analysis-history.v1",
    snapshot: {
      constraints: {
        investment_horizon: "长期",
        investment_objective: "长期增长",
        near_term_liquidity: "unknown",
        tolerable_drawdown: "中等",
      },
      contracts_version: "1.0.0",
      created_at: "2026-07-25T07:45:00.000Z",
      lines: [{
        asset_class: "etf",
        confirmed_at: "2026-07-25T07:45:00.000Z",
        entry_method: "example",
        line_id: "line-history-1",
        market: "SH",
        name: "虚构宽基 ETF",
        observation_date: "2026-07-24",
        size_basis: "示例持仓规模：中等",
        symbol: "510300.SH",
      }],
      snapshot_id: summary.snapshot_id,
      theme_id: "eastern_observation",
    },
    theme_narrative_version: "theme-narrative.v1",
  } as HistoryRecordV1;
}

describe("history view read projection", () => {
  it("reads summaries and immutable details through the #33 interface", async () => {
    const detail: HistoryReadResult = { status: "found", record: record() };
    const reader: HistoryReader = {
      getDetail: vi.fn(async () => detail),
      list: vi.fn(async () => [summary]),
    };

    const result = await loadHistoryEntries(reader, "workspace-history");

    expect(reader.list).toHaveBeenCalledWith("workspace-history");
    expect(reader.getDetail).toHaveBeenCalledWith("workspace-history", summary.record_id);
    expect(result).toEqual({ status: "loaded", entries: [{ detail, summary }] });
  });

  it("keeps list failure and per-record failure typed without creating fallback history", async () => {
    const listFailure: HistoryReader = {
      getDetail: vi.fn(),
      list: vi.fn(async () => { throw new Error("private payload must not surface"); }),
    };
    expect(await loadHistoryEntries(listFailure, "workspace-history")).toEqual({ status: "unavailable" });

    const detailFailure: HistoryReader = {
      getDetail: vi.fn(async () => { throw new Error("read failed"); }),
      list: vi.fn(async () => [summary]),
    };
    expect(await loadHistoryEntries(detailFailure, "workspace-history")).toEqual({
      status: "loaded",
      entries: [{
        detail: { status: "unavailable", code: "storage_failure" },
        summary,
      }],
    });
  });

  it("derives only honest example and evidence-source labels from committed bytes", () => {
    expect(historyRecordBoundary(record())).toEqual({ evidence: "fixture", isExample: true });
    expect(historyRecordBoundary(record("daily-cache"))).toEqual({ evidence: "cache", isExample: true });
    expect(formatHistoryDateTime("invalid")).toBe("时间未知");
    expect(formatHistoryDateTime("2026-07-25T08:30:00.000Z")).not.toBe("时间未知");
  });
});

export { record, summary };
