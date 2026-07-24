import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PortfolioDraft } from "../../src/contracts/index.js";
import { createExampleDraft } from "../../src/portfolio/index.js";
import {
  appendHolding,
  deleteHolding,
  editConstraints,
  editHolding,
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

    expect(markup).toContain("仓位／身份");
    expect(markup).toContain("随机体验身份 · 示例数据");
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
