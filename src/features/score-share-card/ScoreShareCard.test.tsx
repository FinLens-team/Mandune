import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../fixtures/index.js";
import { longCardRuntimeFromFixture } from "../long-card/LongCard.js";
import { ScoreShareCard } from "./ScoreShareCard.js";

function scoreableInput() {
  const input = longCardRuntimeFromFixture(structuredClone(FIXTURES.supported_full));
  const base = input.analysis.derived[0];
  if (!base) throw new Error("Fixture needs one derived item as a template.");
  input.analysis.derived.push(
    { ...base, id: "market-3-session-test-return-pct", label: "短期收益", value: 1.2, unit: "percent" },
    { ...base, id: "market-1-month-test-return-pct", label: "中期收益", value: 3.5, unit: "percent" },
    { ...base, id: "market-1-year-test-max-drawdown-pct", label: "最大回撤", value: -12, unit: "percent" },
  );
  return input;
}

describe("score share card", () => {
  it("leads with tier and renders score, role, roast and market dimensions", () => {
    const markup = renderToStaticMarkup(createElement(ScoreShareCard, { input: scoreableInput() }));

    expect(markup).toContain("今日持仓段位");
    expect(markup).toMatch(/data-tier="(夯|顶级|人上人|NPC|拉完了)"/u);
    expect(markup).toMatch(/<strong>\d+\.\d<\/strong><span>综合分 · \/10\.0<\/span>/u);
    expect(markup).toContain("本局角色");
    expect(markup).toContain("短期表现");
    expect(markup).toContain("中期趋势");
    expect(markup).toContain("回撤控制");
    expect(markup).toContain("持仓结构");
    expect(markup).toContain("分享评分卡");
    expect(markup).not.toContain("不代表收益预测");
  });

  it("does not expose holding names in the share panel", () => {
    const input = scoreableInput();
    const markup = renderToStaticMarkup(createElement(ScoreShareCard, { input }));
    for (const line of input.snapshot.lines) {
      expect(markup).not.toContain(line.name);
      expect(markup).not.toContain(line.symbol);
    }
  });

  it("does not score an unavailable analysis", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.unavailable_no_evidence);
    expect(renderToStaticMarkup(createElement(ScoreShareCard, { input }))).toBe("");
  });

  it("does not grade historical results without all required market horizons", () => {
    const input = longCardRuntimeFromFixture(structuredClone(FIXTURES.supported_full));
    input.analysis.derived = input.analysis.derived.filter((item) => !item.id.includes("market-1-year-"));
    expect(renderToStaticMarkup(createElement(ScoreShareCard, { input }))).toBe("");
  });

  it("keeps the mobile layout single-column with a full-width share action", () => {
    const stylesheet = readFileSync("src/features/score-share-card/ScoreShareCard.css", "utf8");
    expect(stylesheet).toContain("@media (max-width: 620px)");
    expect(stylesheet).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(stylesheet).toMatch(/\.score-share-card__share\s*\{[^}]*width:\s*100%/su);
    expect(stylesheet).not.toContain("100vw");
  });
});
