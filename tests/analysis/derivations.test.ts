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
