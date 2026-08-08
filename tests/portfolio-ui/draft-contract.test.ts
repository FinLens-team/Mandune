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

describe("random holdings", () => {
  it("appends one realistic contract-valid line without analysis-polluting labels", () => {
    const base = createEmptyDraft();
    const next = appendRandomHoldings(base, {
      random: () => 0.42,
      now: new Date("2026-07-26T12:00:00.000Z"),
    });

    expect(next.lines).toHaveLength(1);
    const line = next.lines[0]!;
    expect(line.entry_method).toBe("manual");
    expect(line.name).not.toMatch(/体验|示例/);
    expect(line.notes).toBeUndefined();
    expect(line.size_basis).toBe("核心仓位，约占当前持仓总市值 100%");
    expect(line.current_market_value_cny).toBeGreaterThan(0);
    expect(line.cost_basis_cny).toBeGreaterThan(0);
    expect(next.total_market_value_cny).toBe(line.current_market_value_cny);
    expect(next.cash_balance_cny).toBeGreaterThan(0);
    expect(line.observation_date).toMatch(/^2026-0[4-7]-\d{2}$/);
    expect(line.is_usable).toBe(true);
    expect(validatePortfolioDraft(next).ok).toBe(true);
  });

  it("does not repeat an existing instrument and stays a draft until confirmed", () => {
    const first = appendRandomHoldings(createEmptyDraft(), { random: () => 0.1 });
    const next = appendRandomHoldings(first, { random: () => 0.1 });
    expect(next.lines).toHaveLength(2);
    expect(next.lines[1]!.symbol).not.toBe(next.lines[0]!.symbol);
    expect(next.lines.reduce((sum, line) => sum + (line.current_market_value_cny ?? 0), 0))
      .toBe(next.total_market_value_cny);
    for (const line of next.lines) {
      const percent = (line.current_market_value_cny ?? 0) / (next.total_market_value_cny ?? 1) * 100;
      expect(line.size_basis).toContain(`${Number(percent.toFixed(1))}%`);
    }

    // 仍需显式确认：草稿本身不是快照，确认路径与手工持仓一致。
    const result = snapshotCurrentDraft(next);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.lines).toHaveLength(next.lines.length);
      expect(result.snapshot.lines.every((line) => line.entry_method === "manual")).toBe(true);
    }
  });
});
