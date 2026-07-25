import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../fixtures/index.js";
import {
  AiNarrativeFront,
  LongCard,
  RationalEvidenceBack,
  longCardRuntimeFromFixture,
  longCardRuntimeIsDisplayable,
  longCardFlipTarget,
  longCardGestureIntent,
  preserveFaceScrollOffsets,
} from "./LongCard.js";

describe("long-card rendering and interaction boundaries", () => {
  it("renders a button-accessible front face with an announced current side", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.limited_partial);
    const markup = renderToStaticMarkup(createElement(LongCard, { input }));
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("当前：东方观象");
    expect(markup).toContain("查看证据");
    expect(markup).toContain("横向拖动也可翻面，纵向滚动始终用于阅读。");
    expect(markup).toContain("随机体验身份 · 示例数据");
    expect(markup).toContain("有限分析");
    expect(markup).toContain("AI 分析仅供信息整理与理解参考，不对投资决策或结果负责；请自行判断与操作。");
    expect(markup).not.toContain("风险与判断边界");
  });

  it("renders an unavailable result without a normal long-card stage", () => {
    const markup = renderToStaticMarkup(
      createElement(LongCard, { input: longCardRuntimeFromFixture(FIXTURES.unavailable_no_evidence) }),
    );
    expect(markup).toContain("当前证据不足以生成复盘报告");
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
    const input = longCardRuntimeFromFixture(fixture);
    const markup = renderToStaticMarkup(
      createElement(RationalEvidenceBack, {
        faceId: "evidence-face",
        input,
        headingId: "evidence-heading",
        headingRef: { current: null },
      }),
    );
    expect(markup).toContain(fixture.snapshot.snapshot_id);
    expect(markup).toContain(fixture.analysis.analysis_id);
    expect(markup).toContain(fixture.analysis.evidence_cutoff_at);
    expect(markup).not.toContain("与正面同一版本");
    for (const conclusion of fixture.analysis.conclusions) {
      expect(markup).toContain(conclusion.statement);
      for (const ref of conclusion.refs) expect(markup).toContain(ref.ref_id);
    }
    for (const advice of fixture.analysis.advice) {
      expect(markup).toContain(advice.statement);
      for (const ref of advice.trigger_refs) expect(markup).toContain(ref.ref_id);
    }
  });

  it("renders only a validated matching runtime narrative", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.supported_full);
    expect(longCardRuntimeIsDisplayable(input)).toBe(true);
    expect(input.narrative).toBeDefined();
    if (!input.narrative) return;

    const markup = renderToStaticMarkup(createElement(LongCard, { input }));
    expect(markup).toContain(input.narrative.headline);
    for (const paragraph of input.narrative.body_paragraphs) {
      expect(markup).toContain(paragraph);
    }
    expect(markup).toContain(input.narrative.guidance_summary);

    const mismatched = {
      ...input,
      narrative: { ...input.narrative, rational_analysis_id: "another-analysis" },
    };
    const mismatchedMarkup = renderToStaticMarkup(createElement(LongCard, { input: mismatched }));
    expect(longCardRuntimeIsDisplayable(mismatched)).toBe(false);
    expect(mismatchedMarkup).toContain("复盘报告暂不可展示");
    expect(mismatchedMarkup).not.toContain("mandong-long-card__stage");
  });

  it("keeps the explicit observation-only fixture adapter displayable without advice", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.observation_only_gaps);
    expect(input.narrative?.guidance_summary).toBe("");
    expect(longCardRuntimeIsDisplayable(input)).toBe(true);
    expect(renderToStaticMarkup(createElement(LongCard, { input }))).toContain(
      "当前证据只支持观察，不支持方向性建议。",
    );
  });

  it("does not render a normal letter when the runtime narrative is absent", () => {
    const withoutNarrative = longCardRuntimeFromFixture(FIXTURES.limited_partial);
    delete withoutNarrative.narrative;
    const markup = renderToStaticMarkup(createElement(LongCard, { input: withoutNarrative }));
    expect(markup).toContain("复盘报告暂不可展示");
    expect(markup).not.toContain("mandong-long-card__stage");
  });

  it("renders relaxed model text as Markdown on the long-card front", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.supported_full);
    const markup = renderToStaticMarkup(createElement(AiNarrativeFront, {
      aiText: "## 核心观察\n\n- **保持观察**",
      faceId: "front",
      headingId: "front-heading",
      headingRef: { current: null },
      input,
    }));

    expect(markup).toContain("<h2>核心观察</h2>");
    expect(markup).toContain("<strong>保持观察</strong>");
  });

  it("keeps a reduced-motion fallback, 680px axis, and vertical touch panning", () => {
    const stylesheet = readFileSync("src/features/long-card/LongCard.css", "utf8");
    expect(stylesheet).toContain("var(--content-reading)");
    expect(stylesheet).toContain("touch-action: pan-y");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain('data-reduced-motion="true"');
  });
});
