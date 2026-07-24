import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../fixtures/index.js";
import {
  LongCard,
  RationalEvidenceBack,
  longCardFlipTarget,
  longCardGestureIntent,
  preserveFaceScrollOffsets,
} from "./LongCard.js";

describe("long-card rendering and interaction boundaries", () => {
  it("renders a button-accessible front face with an announced current side", () => {
    const markup = renderToStaticMarkup(createElement(LongCard, { fixture: FIXTURES.limited_partial }));
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("当前：东方观象");
    expect(markup).toContain("查看证据");
    expect(markup).toContain("横向拖动也可翻面，纵向滚动始终用于阅读。");
    expect(markup).toContain("随机体验身份 · 示例数据");
    expect(markup).toContain("有限分析");
  });

  it("renders an unavailable result without a normal long-card stage", () => {
    const markup = renderToStaticMarkup(
      createElement(LongCard, { fixture: FIXTURES.unavailable_no_evidence }),
    );
    expect(markup).toContain("当前证据不足以生成观象长笺");
    expect(markup).not.toContain("mandong-long-card__stage");
    expect(markup).toContain("可以怎样恢复");
  });

  it("flips only for a horizontal swipe and leaves vertical reading gestures alone", () => {
    expect(longCardFlipTarget({ x: 160, y: 20 }, { x: 80, y: 28 })).toBe(true);
    expect(longCardFlipTarget({ x: 80, y: 20 }, { x: 160, y: 28 })).toBe(false);
    expect(longCardFlipTarget({ x: 100, y: 20 }, { x: 112, y: 140 })).toBeNull();
    expect(longCardFlipTarget({ x: 160, y: 20 }, { x: 80, y: 140 })).toBeNull();
    expect(longCardGestureIntent({ x: 120, y: 20 }, { x: 112, y: 160 })).toBe("vertical");
    expect(longCardGestureIntent({ x: 160, y: 20 }, { x: 80, y: 28 })).toBe("horizontal");
  });

  it("keeps separate reading offsets for each face", () => {
    const firstSwitch = preserveFaceScrollOffsets(
      { narrative: null, evidence: null },
      "narrative",
      "evidence",
      420,
    );
    expect(firstSwitch).toEqual({ narrative: 420, evidence: 420 });
    expect(preserveFaceScrollOffsets(firstSwitch, "evidence", "narrative", 810)).toEqual({
      narrative: 420,
      evidence: 810,
    });
  });

  it("renders the rational back with the exact analysis identifiers and all references", () => {
    const fixture = FIXTURES.limited_partial;
    const markup = renderToStaticMarkup(
      createElement(RationalEvidenceBack, {
        faceId: "evidence-face",
        fixture,
        headingId: "evidence-heading",
        headingRef: { current: null },
      }),
    );
    expect(markup).toContain(fixture.snapshot.snapshot_id);
    expect(markup).toContain(fixture.analysis.analysis_id);
    expect(markup).toContain(fixture.analysis.evidence_cutoff_at);
    for (const conclusion of fixture.analysis.conclusions) {
      expect(markup).toContain(conclusion.statement);
      for (const ref of conclusion.refs) expect(markup).toContain(ref.ref_id);
    }
    for (const advice of fixture.analysis.advice) {
      expect(markup).toContain(advice.statement);
      for (const ref of advice.trigger_refs) expect(markup).toContain(ref.ref_id);
    }
  });

  it("keeps a reduced-motion fallback, 680px axis, and vertical touch panning", () => {
    const stylesheet = readFileSync("src/features/long-card/LongCard.css", "utf8");
    expect(stylesheet).toContain("var(--content-reading)");
    expect(stylesheet).toContain("touch-action: pan-y");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain('data-reduced-motion="true"');
  });
});
