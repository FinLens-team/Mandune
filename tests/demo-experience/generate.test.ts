import { describe, expect, it } from "vitest";
import { getFixture } from "../../src/fixtures/index.js";
import {
  createDemoExperienceFromSeed,
  rerollDemoExperience,
} from "../../src/demo-experience/index.js";

const FIXED_NOW = () => new Date("2026-07-25T08:00:00.000Z");

describe("random demo experience", () => {
  it("replays the same seed deterministically", () => {
    const first = createDemoExperienceFromSeed(47, FIXED_NOW);
    const replay = createDemoExperienceFromSeed(47, FIXED_NOW);

    expect(replay).toEqual(first);
    expect(first.seed).toBe("demo-experience-0000002f");
    expect(first.is_example).toBe(true);
    expect(first.source_label).toBe("测试 fixture · 非实时行情");
  });

  it("only selects A-share or ETF lines backed by available observed fixture evidence", () => {
    const fixture = getFixture("supported_full");
    const identity = createDemoExperienceFromSeed(3, FIXED_NOW);

    expect(identity.holdings.length).toBeGreaterThan(0);
    for (const holding of identity.holdings) {
      expect(["a_share", "etf"]).toContain(holding.asset_class);
      expect(holding.evidence_status).toBe("available");
      expect(holding.provenance).toBe("observed");
      expect(holding.observed_at).not.toBe(holding.fetched_at);
      expect(holding.source_locator).toMatch(/^fixture:\/\//);

      const line = fixture.snapshot.lines.find((candidate) => candidate.line_id === holding.line_id);
      const evidence = fixture.analysis.evidence.find(
        (candidate) => candidate.id === holding.evidence_id,
      );
      expect(line?.symbol).toBe(holding.symbol);
      expect(evidence?.value).toBe(holding.observed_value);
      expect(evidence?.observation_or_event_time).toBe(holding.observed_at);
      expect(evidence?.fetched_at).toBe(holding.fetched_at);
    }
  });

  it("always emits exactly the four contract constraints and preserves unknown as valid", () => {
    const keys = [
      "investment_horizon",
      "near_term_liquidity",
      "tolerable_drawdown",
      "investment_objective",
    ];
    const identities = Array.from({ length: 64 }, (_, seed) =>
      createDemoExperienceFromSeed(seed, FIXED_NOW),
    );

    for (const identity of identities) {
      expect(Object.keys(identity.constraints).sort()).toEqual([...keys].sort());
    }
    expect(
      identities.some((identity) =>
        Object.values(identity.constraints).some(
          (value) => value === "unknown" || value === "not_decided",
        ),
      ),
    ).toBe(true);
  });

  it("guarantees a different reproducible seed when reroll entropy repeats", () => {
    const current = createDemoExperienceFromSeed(0, FIXED_NOW);
    const rerolled = rerollDemoExperience(current, () => 0, FIXED_NOW);

    expect(rerolled.seed).toBe("demo-experience-00000001");
    expect(rerolled.seed).not.toBe(current.seed);
  });
});
