import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PortfolioDraft } from "../../src/contracts/index.js";
import { createExampleDraft, updateConstraints } from "../../src/portfolio/index.js";

interface ReviewModule {
  PortfolioEditor: ComponentType<{
    draft: PortfolioDraft;
    experienceSource?: "random" | "edited";
    onChange: (draft: PortfolioDraft) => void;
  }>;
}

const REVIEW_MODULE_PATH = ["..", "..", "src", "features", "review", "ReviewPage.js"].join("/");

async function loadReview(): Promise<ReviewModule> {
  return (await import(REVIEW_MODULE_PATH)) as ReviewModule;
}

describe("S6 portfolio and identity editor", () => {
  it("keeps evidence-first summary and complete real draft fields in one responsive row", async () => {
    const { PortfolioEditor } = await loadReview();
    const draft = createExampleDraft();
    const markup = renderToStaticMarkup(
      createElement(PortfolioEditor, {
        draft,
        experienceSource: "edited",
        onChange: vi.fn(),
      }),
    );

    expect(markup).toContain("体验持仓 · 已编辑");
    expect(markup).toContain("持仓（3）");
    expect(markup).toContain("四项约束");
    expect(markup).toContain("核对与编辑完整字段");
    expect(markup).toContain("观察日");
    expect(markup).toContain("市场");
    expect(markup).toContain("录入方式");
    expect(markup).toContain("体验生成");
    expect(markup).toContain("这里只展示草稿中真实存在的输入字段");
    expect(markup).not.toContain("实时行情");
    expect(markup).not.toContain("止损线");
  });

  it("preserves a typed not_decided constraint without replacing it with a guessed value", async () => {
    const { PortfolioEditor } = await loadReview();
    const draft = updateConstraints(createExampleDraft(), {
      investment_horizon: "not_decided",
      near_term_liquidity: "unknown",
      tolerable_drawdown: "unknown",
      investment_objective: "unknown",
    });
    const markup = renderToStaticMarkup(
      createElement(PortfolioEditor, {
        draft,
        onChange: vi.fn(),
      }),
    );

    expect(markup).toContain('<option value="not_decided" selected="">未知／尚未决定</option>');
    expect(markup).toContain('<option value="unknown" selected="">未知／尚未决定</option>');
  });
});
