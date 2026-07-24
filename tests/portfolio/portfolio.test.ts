import { describe, expect, it } from "vitest";
import {
  addLine,
  createExampleDraft,
  createManualLine,
  createSnapshotFromDraft,
  listUnresolvedLines,
  listUsableLines,
  updateConstraints,
  updateLine,
} from "../../src/portfolio/index.js";

describe("portfolio draft and snapshot", () => {
  it("marks example data and keeps unresolved lines out of batch confirm", () => {
    const draft = createExampleDraft();
    expect(draft.source_label).toBe("示例数据");
    expect(listUsableLines(draft).length).toBe(2);
    expect(listUnresolvedLines(draft).length).toBe(1);

    const result = createSnapshotFromDraft(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.lines).toHaveLength(2);
    expect(result.skipped_line_ids).toHaveLength(1);
    expect(
      result.snapshot.lines.every((line) => line.symbol !== "unknown"),
    ).toBe(true);
  });

  it("allows all constraints to remain unknown", () => {
    const draft = createExampleDraft();
    const withUnknown = updateConstraints(draft, {
      investment_horizon: "unknown",
      near_term_liquidity: "unknown",
      tolerable_drawdown: "unknown",
      investment_objective: "unknown",
    });
    const result = createSnapshotFromDraft(withUnknown);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.constraints.investment_horizon).toBe("unknown");
  });

  it("does not write ambiguous manual lines into snapshots", () => {
    let draft = createExampleDraft();
    draft = {
      ...draft,
      lines: [],
    };
    draft = addLine(
      draft,
      createManualLine({
        asset_class: "a_share",
        name: "模糊股票",
        symbol: "unknown",
        size_basis: "unknown",
        observation_date: "unknown",
      }),
    );
    expect(listUsableLines(draft)).toHaveLength(0);
    const result = createSnapshotFromDraft(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("no_usable_lines");
  });

  it("creates immutable snapshots that do not rewrite previous objects", () => {
    const draft = createExampleDraft();
    const first = createSnapshotFromDraft(draft);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const patched = updateLine(draft, draft.lines[0]!.line_id, {
      name: "已修改示例名称",
    });
    const second = createSnapshotFromDraft(patched);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(first.snapshot.snapshot_id).not.toBe(second.snapshot.snapshot_id);
    expect(first.snapshot.lines[0]?.name).not.toBe("已修改示例名称");
    expect(Object.isFrozen(first.snapshot)).toBe(true);
  });

  it("supports single-line confirmation", () => {
    const draft = createExampleDraft();
    const usable = listUsableLines(draft)[0]!;
    const result = createSnapshotFromDraft(draft, { line_ids: [usable.line_id] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.lines).toHaveLength(1);
    expect(result.snapshot.lines[0]?.line_id).toBe(usable.line_id);
  });
});
