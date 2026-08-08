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
        expect(holding.observation_date).toMatch(/^2026-\d{2}-\d{2}$/);
        expect(new Date(`${holding.observation_date}T00:00:00Z`).getUTCDay()).not.toBe(0);
        expect(new Date(`${holding.observation_date}T00:00:00Z`).getUTCDay()).not.toBe(6);
        expect(holding.current_market_value_cny).toBeGreaterThan(0);
        expect(holding.cost_basis_cny).toBeGreaterThan(0);
        expect(holding.size_basis).toContain("当前持仓总市值");
        expect(holding.source_name).toBe("内置标的随机生成");
      }
    }
  });

  it("emits a complete internally consistent valuation and fills all four preferences", () => {
    const identities = Array.from({ length: 64 }, (_, seed) =>
      createDemoExperienceFromSeed(seed, FIXED_NOW),
    );
    const keys = [
      "investment_horizon",
      "near_term_liquidity",
      "tolerable_drawdown",
      "investment_objective",
    ];

    for (const identity of identities) {
      expect(Object.keys(identity.constraints).sort()).toEqual([...keys].sort());
      expect(Object.values(identity.constraints).every((value) => value !== "unknown" && value !== "not_decided")).toBe(true);
      expect(identity.total_market_value_cny).toBeGreaterThan(0);
      expect(identity.cash_balance_cny).toBeGreaterThan(0);
      expect(identity.holdings.reduce((sum, holding) => sum + holding.current_market_value_cny, 0))
        .toBeCloseTo(identity.total_market_value_cny, 2);
      const cashRatio = identity.cash_balance_cny /
        (identity.cash_balance_cny + identity.total_market_value_cny);
      expect(cashRatio).toBeGreaterThanOrEqual(0.1);
      expect(cashRatio).toBeLessThanOrEqual(0.22);
      for (const holding of identity.holdings) {
        expect(holding.cost_basis_cny / holding.current_market_value_cny).toBeGreaterThanOrEqual(0.88);
        expect(holding.cost_basis_cny / holding.current_market_value_cny).toBeLessThanOrEqual(1.12);
        const percent = holding.current_market_value_cny / identity.total_market_value_cny * 100;
        expect(holding.size_basis).toContain(`${Number(percent.toFixed(1))}%`);
      }
    }
  });

  it("guarantees a different reproducible seed when reroll entropy repeats", () => {
    const current = createDemoExperienceFromSeed(0, FIXED_NOW);
    const rerolled = rerollDemoExperience(current, () => 0, FIXED_NOW);

    expect(rerolled.seed).toBe("demo-experience-00000001");
    expect(rerolled.seed).not.toBe(current.seed);
    expect(rerolled.holdings[0]?.symbol).not.toBe(current.holdings[0]?.symbol);
  });
});
