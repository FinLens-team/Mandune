import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CONTRACTS_VERSION,
  SERVICE_NAME,
  adviceStatementIsAllowed,
  scanPrivacy,
  validateAnalysisResult,
  validateLongCardData,
  validatePortfolioSnapshot,
} from "../../src/contracts/index.js";
import {
  FIXTURES,
  getFixture,
  hashFixture,
  listFixtureScenarios,
  replayAllFixtures,
  replayFixture,
} from "../../src/fixtures/index.js";

describe("contracts public surface", () => {
  it("exports stable service and contracts version", () => {
    expect(SERVICE_NAME).toBe("mandong");
    expect(CONTRACTS_VERSION).toBe("1.0.0");
  });
});

describe("privacy scan", () => {
  it("flags forbidden identity and credential fields", () => {
    const issues = scanPrivacy({
      snapshot_id: "x",
      api_key: "secret",
      nested: { account_number: "123", screenshot: "raw" },
    });
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain("privacy_forbidden_field");
    expect(issues.some((issue) => issue.path.includes("api_key"))).toBe(true);
    expect(issues.some((issue) => issue.path.includes("account_number"))).toBe(
      true,
    );
    expect(issues.some((issue) => issue.path.includes("screenshot"))).toBe(true);
  });
});

describe("advice policy", () => {
  it("allows qualitative directions and rejects exact instructions", () => {
    expect(adviceStatementIsAllowed("维持观察，等待下一完整交易日证据更新。")).toBe(
      true,
    );
    expect(adviceStatementIsAllowed("建议仓位降到 20%")).toBe(false);
    expect(adviceStatementIsAllowed("买入 1000 股")).toBe(false);
    expect(adviceStatementIsAllowed("目标价 12.5 元")).toBe(false);
    expect(adviceStatementIsAllowed("下周一 10:30 卖出")).toBe(false);
  });
});

describe("fixture matrix", () => {
  it("covers all four analysis statuses", () => {
    const statuses = new Set(
      listFixtureScenarios().map((id) => getFixture(id).analysis.status),
    );
    expect(statuses).toEqual(
      new Set([
        "supported",
        "limited",
        "observation_only",
        "unavailable",
      ]),
    );
  });

  it("validates every fixture snapshot and analysis", () => {
    for (const id of listFixtureScenarios()) {
      const fixture = getFixture(id);
      expect(fixture.is_example).toBe(true);
      expect(fixture.example_label).toBe("示例数据");
      expect(fixture.contracts_version).toBe(CONTRACTS_VERSION);

      const snapshot = validatePortfolioSnapshot(fixture.snapshot);
      const analysis = validateAnalysisResult(fixture.analysis);
      expect(snapshot.ok, `${id} snapshot`).toBe(true);
      expect(analysis.ok, `${id} analysis: ${JSON.stringify(analysis)}`).toBe(
        true,
      );
    }
  });

  it("replays with stable hashes", () => {
    const first = replayAllFixtures();
    const second = replayAllFixtures();
    expect(first).toEqual(second);
    for (const row of first) {
      expect(row.snapshot_ok).toBe(true);
      expect(row.analysis_ok).toBe(true);
      expect(row.fixture_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.fixture_hash).toBe(hashFixture(row.scenario_id));
      expect(createHash("sha256").update(row.fixture_hash).digest("hex")).toMatch(
        /^[a-f0-9]{64}$/,
      );
    }
  });

  it("rejects unknown contracts versions", () => {
    const fixture = structuredClone(FIXTURES.supported_full);
    fixture.analysis.contracts_version = "0.0.0-unknown";
    const result = validateAnalysisResult(fixture.analysis);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((issue) => issue.code === "unknown_contracts_version"),
      ).toBe(true);
    }
  });

  it("rejects missing material refs and out-of-policy advice", () => {
    const fixture = structuredClone(FIXTURES.supported_full);
    fixture.analysis.conclusions[0] = {
      ...fixture.analysis.conclusions[0]!,
      refs: [],
    };
    fixture.analysis.advice[0] = {
      ...fixture.analysis.advice[0]!,
      statement: "建议仓位降到 30%",
    };
    const result = validateAnalysisResult(fixture.analysis);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((issue) => issue.code);
      expect(codes).toContain("missing_material_ref");
      expect(codes).toContain("advice_boundary");
    }
  });

  it("rejects privacy-bearing payloads", () => {
    const fixture = structuredClone(FIXTURES.supported_full);
    const poisoned = {
      ...fixture.analysis,
      screenshot: "raw-bytes",
    };
    const result = validateAnalysisResult(poisoned);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((issue) => issue.code === "privacy_forbidden_field"),
      ).toBe(true);
    }
  });

  it("rejects unavailable long cards", () => {
    const fixture = getFixture("unavailable_no_evidence");
    const result = validateLongCardData({
      contracts_version: CONTRACTS_VERSION,
      card_id: "card-x",
      analysis_id: fixture.analysis.analysis_id,
      status: "unavailable",
      snapshot: fixture.snapshot,
      analysis_started_at: fixture.analysis.analysis_started_at,
      analysis_completed_at: fixture.analysis.analysis_completed_at,
      latest_complete_trading_day: fixture.analysis.latest_complete_trading_day,
      evidence_cutoff_at: fixture.analysis.evidence_cutoff_at,
      coverage: fixture.analysis.coverage,
      constraints: fixture.analysis.constraints,
      conclusions: [],
      advice: [],
      evidence_refs: [],
      unknowns: fixture.analysis.unknowns,
      risk_notes: fixture.analysis.risk_notes,
      front: {
        theme_id: "eastern_observation",
        headline: "x",
        body_paragraphs: ["y"],
        mascot_mood: "calm",
        guidance_summary: "z",
      },
      back: {
        derivation_summary: "d",
        concept_explanations: [],
        standard_risk_notice: "r",
      },
      is_example: true,
      example_label: "示例数据",
    });
    expect(result.ok).toBe(false);
  });

  it("keeps dual timestamps distinguishable in fixtures", () => {
    const fixture = getFixture("supported_full");
    for (const evidence of fixture.analysis.evidence) {
      expect(evidence.observation_or_event_time).not.toEqual("");
      expect(evidence.fetched_at).not.toEqual("");
      // fetched_at is system time; observation is market/event time — both present
      expect(evidence.observation_or_event_time).toBeTypeOf("string");
      expect(evidence.fetched_at).toBeTypeOf("string");
    }
    expect(fixture.analysis.evidence_cutoff_at).toBeTypeOf("string");
  });

  it("does not invent current values for non-available evidence", () => {
    const limited = getFixture("limited_partial");
    const unsupported = limited.analysis.evidence.find(
      (item) => item.status === "unsupported",
    );
    expect(unsupported).toBeDefined();
    expect(unsupported?.value).toBeNull();
    expect(unsupported?.limitations.length).toBeGreaterThan(0);

    const observation = getFixture("observation_only_gaps");
    for (const evidence of observation.analysis.evidence) {
      if (evidence.status !== "available") {
        expect(evidence.limitations.length).toBeGreaterThan(0);
      }
    }
  });

  it("replay helper is deterministic for a single scenario", () => {
    expect(replayFixture("supported_full")).toEqual(
      replayFixture("supported_full"),
    );
  });
});
