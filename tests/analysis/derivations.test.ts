import { describe, expect, it } from "vitest";
import { deriveAnalysisInputs } from "../../src/analysis/index.js";
import { marketEvidence, snapshot, TRADING_DAY } from "./fixtures.js";

describe("deterministic analysis derivations", () => {
  it.each([
    ["supported", [marketEvidence("line-1"), marketEvidence("line-2")]],
    ["limited", [marketEvidence("line-1"), marketEvidence("line-2", "unsupported")]],
    ["observation_only", [marketEvidence("line-1", "stale"), marketEvidence("line-2", "unsupported")]],
    ["unavailable", []],
  ] as const)("derives the %s status from coverage without model judgment", (status, evidence) => {
    const result = deriveAnalysisInputs({
      snapshot: snapshot(),
      evidence,
      latestCompleteTradingDay: TRADING_DAY,
    });

    expect(result.status).toBe(status);
    expect(result.coverage.covered_line_ids).toEqual(
      status === "supported" ? ["line-1", "line-2"] : status === "limited" ? ["line-1"] : [],
    );
    expect(result.derived.map((item) => item.id)).toEqual([...result.derived.map((item) => item.id)].sort());
    expect(result.derived).toContainEqual(expect.objectContaining({
      id: "exposure-declared-share-total",
      value: 100,
      provenance: "derived",
    }));
    expect(result.derived).toContainEqual(expect.objectContaining({
      id: "constraint-value-investment_horizon",
      value: "长期",
      provenance: "derived",
    }));
  });

  it("downgrades an otherwise supported result when a personal constraint is unknown", () => {
    const input = snapshot(1);
    input.constraints.near_term_liquidity = "unknown";

    const result = deriveAnalysisInputs({
      snapshot: input,
      evidence: [marketEvidence("line-1")],
      latestCompleteTradingDay: TRADING_DAY,
    });

    expect(result.status).toBe("limited");
    expect(result.unknowns).toEqual([
      expect.objectContaining({ subject: "near_term_liquidity" }),
    ]);
    expect(result.derived.map((item) => item.id)).not.toContain(
      "constraint-value-near_term_liquidity",
    );
  });

  it("does not treat date-old market data or Bocha candidates as material support", () => {
    const staleByDate = {
      ...marketEvidence("line-1"),
      observation_or_event_time: "2026-07-23",
    };
    const candidate = {
      ...marketEvidence("line-2"),
      metric_or_event_type: "candidate_event",
    };

    const result = deriveAnalysisInputs({
      snapshot: snapshot(),
      evidence: [staleByDate, candidate],
      latestCompleteTradingDay: TRADING_DAY,
    });

    expect(result.status).toBe("observation_only");
    expect(result.coverage.covered_line_ids).toEqual([]);
  });

  it("keeps verified events observable without treating them as structured holding coverage", () => {
    const verifiedEvent = {
      ...marketEvidence("line-1"),
      id: "verified-event-line-1",
      metric_or_event_type: "issuer_notice",
      unit: undefined,
    };

    const result = deriveAnalysisInputs({
      snapshot: snapshot(1),
      evidence: [verifiedEvent],
      latestCompleteTradingDay: TRADING_DAY,
    });

    expect(result.status).toBe("observation_only");
    expect(result.coverage.covered_line_ids).toEqual([]);
    expect(result.coverage.uncovered_line_ids).toEqual(["line-1"]);
    expect(result.coverage.missing_metrics).toEqual(["line-1:material_evidence"]);
  });

  it("derives unit-independent daily change, contribution, exposure and concentration", () => {
    const series = (lineId: string, date: string, value: number): ReturnType<typeof marketEvidence> => ({
      ...marketEvidence(lineId, "ambiguous"),
      id: `panda-${lineId}-${date}`,
      value,
      unit: undefined,
      normalization_note: "unitless_return_eligible:same_provider_method",
      source: { name: `PandaAI method ${lineId}`, locator: `panda:${lineId}:${date}` },
      observation_or_event_time: date,
      limitations: ["原始单位未知，但同方法连续观察值可派生涨跌幅。"],
    });
    const result = deriveAnalysisInputs({
      snapshot: snapshot(),
      evidence: [
        series("line-1", "2026-07-22", 105),
        series("line-1", "2026-07-23", 100),
        series("line-1", TRADING_DAY, 110),
        series("line-2", "2026-07-22", 95),
        series("line-2", "2026-07-23", 100),
        series("line-2", TRADING_DAY, 90),
      ],
      latestCompleteTradingDay: TRADING_DAY,
    });

    expect(result.status).toBe("supported");
    expect(result.coverage.covered_line_ids).toEqual(["line-1", "line-2"]);
    expect(result.derived).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "daily-change-pct-line-1", value: 10, unit: "%" }),
      expect.objectContaining({ id: "daily-change-pct-line-2", value: -10, unit: "%" }),
      expect.objectContaining({ id: "recent-3-session-change-pct-line-1", value: 4.761905, unit: "%" }),
      expect.objectContaining({ id: "recent-3-session-change-pct-line-2", value: -5.263158, unit: "%" }),
      expect.objectContaining({ id: "daily-contribution-pct-point-line-1", value: 6 }),
      expect.objectContaining({ id: "daily-contribution-pct-point-line-2", value: -4 }),
      expect.objectContaining({ id: "daily-portfolio-change-pct", value: 2 }),
      expect.objectContaining({ id: "daily-largest-contributor-line", value: "line-1" }),
      expect.objectContaining({ id: "daily-largest-detractor-line", value: "line-2" }),
      expect.objectContaining({ id: "concentration-top-1-share", value: 60 }),
      expect.objectContaining({ id: "concentration-top-3-share", value: 100 }),
      expect.objectContaining({ id: "concentration-hhi", value: 5200 }),
      expect.objectContaining({ id: "exposure-asset-class-share-a_share", value: 60 }),
      expect.objectContaining({ id: "exposure-asset-class-share-etf", value: 40 }),
    ]));
  });

  it("does not derive a change when fewer than three valid trading days are available", () => {
    const series = (date: string, value: number): ReturnType<typeof marketEvidence> => ({
      ...marketEvidence("line-1", "ambiguous"),
      id: `panda-line-1-${date}`,
      value,
      unit: undefined,
      normalization_note: "unitless_return_eligible:same_provider_method",
      source: { name: "PandaAI method", locator: `panda:line-1:${date}` },
      observation_or_event_time: date,
      limitations: ["同方法连续观察值可派生涨跌幅。"],
    });
    const result = deriveAnalysisInputs({
      snapshot: snapshot(1),
      evidence: [series("2026-07-23", 100), series(TRADING_DAY, 110)],
      latestCompleteTradingDay: TRADING_DAY,
    });

    expect(result.derived.map((item) => item.id)).not.toContain("daily-change-pct-line-1");
    expect(result.derived.map((item) => item.id)).not.toContain("recent-3-session-change-pct-line-1");
    expect(result.coverage.covered_line_ids).toEqual([]);
  });

  it("rejects available market values whose unit is not verified", () => {
    const noUnit = { ...marketEvidence("line-1"), unit: undefined };
    const result = deriveAnalysisInputs({
      snapshot: snapshot(1),
      evidence: [noUnit],
      latestCompleteTradingDay: TRADING_DAY,
    });

    expect(result.status).toBe("observation_only");
    expect(result.coverage.covered_line_ids).toEqual([]);
  });

  it("replays deterministically for identical frozen inputs", () => {
    const input = {
      snapshot: snapshot(),
      evidence: [marketEvidence("line-2"), marketEvidence("line-1")],
      latestCompleteTradingDay: TRADING_DAY,
    };
    expect(deriveAnalysisInputs(input)).toEqual(deriveAnalysisInputs(input));
  });
});
