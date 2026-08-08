import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { validatePortfolioDraft, type PortfolioDraft } from "../../src/contracts/index.js";
import { createExampleDraft } from "../../src/portfolio/index.js";
import {
  appendHolding,
  appendServerRandomHolding,
  deleteHolding,
  editConstraints,
  editHolding,
  editTotalMarketValue,
  snapshotCurrentDraft,
} from "../../src/features/review/model.js";

interface ReviewModule {
  PortfolioEditor: ComponentType<{
    draft: PortfolioDraft;
    onChange: (draft: PortfolioDraft) => void;
  }>;
}

const REVIEW_MODULE_PATH = ["..", "..", "src", "features", "review", "ReviewPage.js"].join("/");

async function loadReview(): Promise<ReviewModule> {
  return (await import(REVIEW_MODULE_PATH)) as ReviewModule;
}

describe("S6 portfolio editor", () => {
  it("renders editable holdings and exactly the four contract constraints with unknown options", async () => {
    const { PortfolioEditor } = await loadReview();
    const markup = renderToStaticMarkup(
      createElement(PortfolioEditor, {
        draft: createExampleDraft(),
        onChange: vi.fn(),
      }),
    );

    expect(markup).toContain("数据管理");
    expect(markup).toContain("当前持仓总市值（元）");
    expect(markup).toContain("只填一个总金额也可以");
    expect(markup).toContain("组合现金余额（元）");
    expect(markup).toContain("当前市值（元）");
    expect(markup).toContain("持仓成本（元）");
    expect(markup).not.toContain("随机体验身份 · 示例数据");
    // 未决字段提示使用表单语言，不暴露契约英文字段名。
    expect(markup).toContain("待补充：代码、持仓规模依据");
    expect(markup).not.toContain("待补充：symbol");
    // unknown 状态展示为空输入框，不把字面量 unknown 渲染进输入值。
    expect(markup).not.toContain('value="unknown"/>');
    expect(markup).toContain("投资期限");
    expect(markup).toContain("近期流动性需求");
    expect(markup).toContain("可承受回撤");
    expect(markup).toContain("投资目标");
    expect(markup.match(/未知／尚未决定/g)).toHaveLength(5);
    expect(markup).not.toContain("止损线");
    expect(markup).not.toContain("调仓纪律");
    expect(markup).not.toContain("风险测评");
  });

  it("edits, adds, and deletes holdings without mutating the prior draft", () => {
    const original = createExampleDraft();
    const lineId = original.lines[0]!.line_id;
    const edited = editHolding(original, lineId, {
      name: "编辑后的 ETF",
      symbol: "510301.SH",
    });
    expect(original.lines[0]?.name).not.toBe("编辑后的 ETF");
    expect(edited.lines[0]?.name).toBe("编辑后的 ETF");
    expect(edited.lines[0]?.symbol).toBe("510301.SH");

    const added = appendHolding(edited, {
      asset_class: "a_share",
      name: "新增体验股票",
      symbol: "000001.SZ",
      size_basis: "体验持仓规模：较小",
      observation_date: "2026-07-24",
    });
    expect(added.lines).toHaveLength(original.lines.length + 1);
    expect(added.lines.at(-1)?.is_usable).toBe(true);

    const removed = deleteHolding(added, lineId);
    expect(removed.lines.some((line) => line.line_id === lineId)).toBe(false);
  });

  it("keeps server-generated market value, cost basis, and cash together in the editable draft", () => {
    const original = createExampleDraft();
    const sourceLine = original.lines[0]!;
    const serverLine = {
      ...sourceLine,
      line_id: "line-server-valuation",
      symbol: "510301.SH",
      current_market_value_cny: 1_200,
      cost_basis_cny: 1_000,
    };

    const next = appendServerRandomHolding(original, serverLine, 300);

    expect(next.cash_balance_cny).toBe(300);
    expect(next.lines.at(-1)).toMatchObject({
      line_id: "line-server-valuation",
      current_market_value_cny: 1_200,
      cost_basis_cny: 1_000,
    });
    expect(original.cash_balance_cny).toBeUndefined();
  });

  it("stores a single total holdings market value in the next immutable snapshot", () => {
    const original = createExampleDraft();
    const valued = editTotalMarketValue(original, "100000.50");
    expect(valued.total_market_value_cny).toBe(100_000.5);
    expect(original.total_market_value_cny).toBeUndefined();
    expect(validatePortfolioDraft(valued).ok).toBe(true);

    const result = snapshotCurrentDraft(valued);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.total_market_value_cny).toBe(100_000.5);
  });

  it("renders an assistive fuzzy-search combobox that never blocks free text", async () => {
    const { PortfolioEditor } = await loadReview();
    const markup = renderToStaticMarkup(
      createElement(PortfolioEditor, {
        draft: createExampleDraft(),
        onChange: vi.fn(),
      }),
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-autocomplete="list"');
    expect(markup).toContain("输入名称／代码／拼音首字母可搜索");
    // Symbol stays free text so unmatched holdings can remain unknown.
    expect(markup).toContain("未知可留空；选中搜索建议会自动回填");
  });

  it("keeps the suggestion-filled market and drops blank markets when adding holdings", () => {
    const original = createExampleDraft();
    const withMarket = appendHolding(original, {
      asset_class: "etf",
      name: "沪深300ETF",
      symbol: "510300.SH",
      market: "SH",
      size_basis: "体验持仓规模：中等",
      observation_date: "2026-07-24",
    });
    expect(withMarket.lines.at(-1)?.market).toBe("SH");

    const withoutMarket = appendHolding(original, {
      asset_class: "fund",
      name: "手工输入基金",
      symbol: "",
      market: "  ",
      size_basis: "",
      observation_date: "",
    });
    const line = withoutMarket.lines.at(-1);
    expect(line?.market).toBeUndefined();
    expect(line?.symbol).toBe("unknown");
  });

  it("saves all-unknown constraints as a new immutable input without rewriting earlier snapshots", () => {
    const original = createExampleDraft();
    const first = snapshotCurrentDraft(original);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const changed = editConstraints(original, {
      investment_horizon: "unknown",
      near_term_liquidity: "unknown",
      tolerable_drawdown: "unknown",
      investment_objective: "unknown",
    });
    const second = snapshotCurrentDraft(changed);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.snapshot.snapshot_id).not.toBe(first.snapshot.snapshot_id);
    expect(Object.values(second.snapshot.constraints)).toEqual([
      "unknown",
      "unknown",
      "unknown",
      "unknown",
    ]);
    expect(Object.isFrozen(first.snapshot)).toBe(true);
  });
});
