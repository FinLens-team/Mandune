import { describe, expect, it } from "vitest";
import {
  createDemoExperienceFromSeed,
  rerollDemoExperience,
} from "../../src/demo-experience/index.js";
import { INSTRUMENT_DICTIONARY } from "../../src/instruments/index.js";

const FIXED_NOW = () => new Date("2026-07-25T08:00:00.000Z");

describe("random demo experience", () => {
  it("replays the same seed deterministically", () => {
    const first = createDemoExperienceFromSeed(47, FIXED_NOW);
    const replay = createDemoExperienceFromSeed(47, FIXED_NOW);

    expect(replay).toEqual(first);
    expect(first.seed).toBe("demo-experience-0000002f");
    expect(first.is_example).toBe(true);
    expect(first.source_label).toBe("内置标的随机生成");
    expect(first.source_kind).toBe("generated");
  });

  it("builds a diversified human-like portfolio from the real instrument pool", () => {
    const identities = Array.from({ length: 32 }, (_, seed) =>
      createDemoExperienceFromSeed(seed, FIXED_NOW),
    );

    for (const identity of identities) {
      expect(identity.holdings.length).toBeGreaterThanOrEqual(4);
      expect(identity.holdings.length).toBeLessThanOrEqual(6);
      expect(new Set(identity.holdings.map((holding) => holding.symbol)).size).toBe(
        identity.holdings.length,
      );
      expect(identity.holdings.filter((holding) => holding.asset_class === "a_share").length).toBeGreaterThanOrEqual(2);
      expect(identity.holdings.some((holding) => holding.asset_class === "etf")).toBe(true);
      expect(identity.holdings.some((holding) => holding.asset_class === "fund")).toBe(true);
      expect(identity.holdings.filter((holding) => holding.size_basis.startsWith("核心仓位"))).toHaveLength(1);
      expect(identity.holdings.filter((holding) => holding.size_basis.startsWith("中等仓位"))).toHaveLength(2);

      for (const holding of identity.holdings) {
        const instrument = INSTRUMENT_DICTIONARY.find(
          (candidate) => candidate.symbol === holding.symbol,
        );
        expect(instrument).toMatchObject({
          asset_class: holding.asset_class,
          name: holding.name,
          ...(holding.market ? { market: holding.market } : {}),
        });
        expect(holding.size_basis).toMatch(/仓位/);
        expect(holding.observation_date).toBe("2026-07-25");
        expect(holding.source_name).toBe("内置标的随机生成");
      }
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
    expect(rerolled.holdings[0]?.symbol).not.toBe(current.holdings[0]?.symbol);
  });
});
