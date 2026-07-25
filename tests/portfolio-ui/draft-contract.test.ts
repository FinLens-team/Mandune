import { describe, expect, it } from "vitest";
import { validatePortfolioDraft } from "../../src/contracts/index.js";
import { createEmptyDraft, createExampleDraft } from "../../src/portfolio/index.js";
import {
  appendHolding,
  appendRandomHoldings,
  editHolding,
  snapshotCurrentDraft,
} from "../../src/features/review/model.js";

/**
 * 回归：数据管理页的每次编辑都会把草稿 PUT 到服务端做契约校验。
 * 修复前 editHolding 允许空串 symbol/size_basis 与非 ISO 日期直接进入草稿，
 * 服务端返回 "symbol invalid." / "size_basis invalid." 等 400，保存报错。
 */
describe("draft edits stay contract-valid on every keystroke", () => {
  it("blank symbol and size_basis become typed unknown, not empty strings", () => {
    const draft = createExampleDraft();
    const lineId = draft.lines[0]!.line_id;

    const cleared = editHolding(draft, lineId, { symbol: "", size_basis: "  " });
    const line = cleared.lines[0]!;
    expect(line.symbol).toBe("unknown");
    expect(line.size_basis).toBe("unknown");
    expect(line.is_usable).toBe(false);

    const checked = validatePortfolioDraft(cleared);
    expect(checked.ok).toBe(true);
  });

  it("keeps every intermediate draft valid while a date is typed character by character", () => {
    let draft = createExampleDraft();
    const lineId = draft.lines[0]!.line_id;

    for (const partial of ["2", "20", "2026", "2026-", "2026-07", "2026-07-2"]) {
      draft = editHolding(draft, lineId, { observation_date: partial });
      const checked = validatePortfolioDraft(draft);
      expect(checked.ok, `partial input "${partial}" must not break the draft`).toBe(true);
      expect(draft.lines[0]!.observation_date).toBe("unknown");
    }

    draft = editHolding(draft, lineId, { observation_date: "2026-07-24" });
    expect(draft.lines[0]!.observation_date).toBe("2026-07-24");
    expect(validatePortfolioDraft(draft).ok).toBe(true);
  });

  it("ignores an empty name patch so the draft never carries a contract-invalid name", () => {
    const draft = createExampleDraft();
    const lineId = draft.lines[0]!.line_id;
    const originalName = draft.lines[0]!.name;

    const cleared = editHolding(draft, lineId, { name: "   " });
    expect(cleared.lines[0]!.name).toBe(originalName);
    expect(validatePortfolioDraft(cleared).ok).toBe(true);
  });

  it("appendHolding turns blank optional fields and malformed dates into legal unknowns", () => {
    const draft = appendHolding(createEmptyDraft(), {
      asset_class: "etf",
      name: "手工输入ETF",
      symbol: "",
      size_basis: "",
      observation_date: "2026.7.24",
    });
    const line = draft.lines[0]!;
    expect(line.symbol).toBe("unknown");
    expect(line.size_basis).toBe("unknown");
    expect(line.observation_date).toBe("unknown");
    expect(validatePortfolioDraft(draft).ok).toBe(true);
  });
});

describe("random experience holdings", () => {
  it("appends contract-valid usable example lines labeled as experience data", () => {
    const base = createEmptyDraft();
    const next = appendRandomHoldings(base, { random: () => 0.42 });

    expect(next.lines.length).toBeGreaterThan(base.lines.length);
    for (const line of next.lines) {
      expect(line.entry_method).toBe("example");
      expect(line.name.startsWith("体验示例 · ")).toBe(true);
      expect(line.notes).toBe("随机体验数据，非真实持仓");
      // 方向性规模文本，不出现精确金额/份额数字。
      expect(line.size_basis).toMatch(/^体验持仓规模：(较小|中等|较大)$/);
      expect(line.is_usable).toBe(true);
    }
    expect(validatePortfolioDraft(next).ok).toBe(true);
  });

  it("does not repeat the same instrument within one batch and stays a draft until confirmed", () => {
    const next = appendRandomHoldings(createEmptyDraft(), { random: () => 0.1 });
    const symbols = next.lines.map((line) => line.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);

    // 仍需显式确认：草稿本身不是快照，确认路径与手工持仓一致。
    const result = snapshotCurrentDraft(next);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.lines).toHaveLength(next.lines.length);
      expect(result.snapshot.lines.every((line) => line.entry_method === "example")).toBe(true);
    }
  });
});
