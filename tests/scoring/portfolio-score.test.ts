import { describe, expect, it } from "vitest";
import { scorePortfolio } from "../../src/scoring/index.js";
import { FIXTURES } from "../../src/fixtures/index.js";

function runtimeFixture(id: keyof typeof FIXTURES) {
  const fixture = structuredClone(FIXTURES[id]);
  return { analysis: fixture.analysis, snapshot: fixture.snapshot };
}

describe("portfolio score", () => {
  it("scores only market performance, drawdown and portfolio structure", () => {
    const input = runtimeFixture("supported_full");
    input.snapshot.lines.push({
      ...input.snapshot.lines[0]!,
      line_id: "line-extra",
      asset_class: "a_share",
      name: "示例消费股",
      symbol: "000001.SZ",
      size_basis: "约 20%",
    });
    input.analysis.coverage.covered_line_ids.push("line-extra");

    const result = scorePortfolio(input);
    expect(result.score.toFixed(1)).toMatch(/^\d+\.\d$/u);
    expect(result.dimensions).toHaveLength(4);
    expect(result.dimensions.map((item) => item.id)).toEqual([
      "short_term",
      "mid_term",
      "risk",
      "diversification",
    ]);
    expect(result.dimensions.reduce((sum, item) => sum + item.maxScore, 0)).toBe(10);
  });

  it("does not change the score when only personal constraints change", () => {
    const input = runtimeFixture("limited_partial");
    const baseline = scorePortfolio(input);
    input.snapshot.constraints = {
      investment_horizon: "unknown",
      near_term_liquidity: "not_decided",
      tolerable_drawdown: "unknown",
      investment_objective: "not_decided",
    };
    input.analysis.constraints = structuredClone(input.snapshot.constraints);

    expect(scorePortfolio(input)).toEqual(baseline);
  });

  it.each([
    [9.4, "夯"],
    [8.4, "顶级"],
    [7.0, "人上人"],
    [5.2, "NPC"],
    [3.5, "拉完了"],
  ] as const)("maps %s to %s", async (score, tier) => {
    const { tierForScore } = await import("../../src/scoring/index.js");
    expect(tierForScore(score)).toBe(tier);
  });

  it("keeps scoring independent from the selected persona", () => {
    const input = runtimeFixture("supported_full");
    const first = scorePortfolio(input);
    input.snapshot.theme_id = "female_succubus";
    input.analysis.theme_id = "female_succubus";
    expect(scorePortfolio(input)).toEqual(first);
  });
});
