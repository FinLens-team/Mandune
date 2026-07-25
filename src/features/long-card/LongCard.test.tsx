import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../fixtures/index.js";
import {
  LongCard,
  RationalEvidenceBack,
  longCardRuntimeFromFixture,
  longCardRuntimeIsDisplayable,
  longCardFlipTarget,
  longCardGestureIntent,
  preserveFaceScrollOffsets,
} from "./LongCard.js";

describe("long-card rendering and interaction boundaries", () => {
  it("renders a gesture and keyboard-accessible front face without report source or state badges", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.limited_partial);
    const markup = renderToStaticMarkup(createElement(LongCard, { input }));
    expect(markup).toContain('aria-label="每日复盘报告内容，按左右方向键切换正面与理性证据。"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("横向拖动也可翻面，纵向滚动始终用于阅读。");
    expect(markup).not.toContain("随机体验身份 · 示例数据");
    expect(markup).not.toContain("有限分析");
    expect(markup).not.toContain("部分证据缺口限制了结论范围");
    expect(markup).not.toContain("查看证据");
    expect(markup).not.toContain("查看理性分析");
    expect(markup).toContain("AI 分析仅供信息整理与理解参考，不对投资决策或结果负责；请自行判断与操作。");
    expect(markup.match(/class="mandong-long-card__face /g)).toHaveLength(2);
    expect(markup).toContain("mandong-long-card__front");
    expect(markup).toContain("mandong-long-card__back");
    expect(markup).toContain('data-face="narrative"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("accepts provenance fields from existing callers without rendering source badges", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.supported_full);
    const editedMarkup = renderToStaticMarkup(createElement(LongCard, { input }));
    const cachedMarkup = renderToStaticMarkup(createElement(LongCard, {
      input: { ...input, exampleLabel: "随机体验身份 · 缓存证据（非实时）" },
    }));
    expect(editedMarkup).toContain("mandong-long-card__stage");
    expect(editedMarkup).not.toContain("体验持仓 · 已编辑");
    expect(cachedMarkup).not.toContain("随机体验身份 · 缓存证据（非实时）");
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
    expect(firstSwitch).toEqual({ narrative: 420, evidence: 0 });
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
        active: true,
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
    for (const evidence of fixture.analysis.evidence) {
      expect(markup).toContain(evidence.source.name);
      expect(markup).toContain(evidence.observation_or_event_time);
      expect(markup).toContain(evidence.fetched_at);
    }
  });

  it("renders unknown and not_decided constraints as equally valid unknown values", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.supported_full);
    const constraints = {
      ...input.analysis.constraints,
      investment_horizon: "unknown" as const,
      near_term_liquidity: "not_decided" as const,
    };
    const markup = renderToStaticMarkup(
      createElement(RationalEvidenceBack, {
        faceId: "evidence-face",
        active: true,
        input: {
          ...input,
          analysis: { ...input.analysis, constraints },
          snapshot: { ...input.snapshot, constraints },
        },
        headingId: "evidence-heading",
        headingRef: { current: null },
      }),
    );
    expect(markup.match(/未知／尚未决定/g)).toHaveLength(2);
    expect(markup).not.toContain(">unknown<");
    expect(markup).not.toContain(">not_decided<");
  });

  it("does not invent missing derivation relationships", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.supported_full);
    const firstDerived = input.analysis.derived[0];
    expect(firstDerived).toBeDefined();
    if (!firstDerived) return;
    const derived = input.analysis.derived.map((item) => ({
      ...item,
      evidence_refs: [],
      input_refs: [],
    }));
    const markup = renderToStaticMarkup(
      createElement(RationalEvidenceBack, {
        faceId: "evidence-face",
        active: true,
        input: { ...input, analysis: { ...input.analysis, derived } },
        headingId: "evidence-heading",
        headingRef: { current: null },
      }),
    );
    expect(markup).toContain(firstDerived.label);
    expect(markup).not.toContain("输入 ；证据");
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

  it("augments the deterministic two-face shell for an aiText-only result", () => {
    const base = longCardRuntimeFromFixture(FIXTURES.limited_partial);
    const input = {
      ...base,
      aiText: "## 核心观察\n\n- **保持观察**",
      narrative: undefined,
    };
    const markup = renderToStaticMarkup(createElement(LongCard, { input }));

    expect(longCardRuntimeIsDisplayable(input)).toBe(true);
    expect(markup).toContain("<h2>核心观察</h2>");
    expect(markup).toContain("<strong>保持观察</strong>");
    expect(markup.match(/class="mandong-long-card__face /g)).toHaveLength(2);
    expect(markup).toContain("mandong-long-card__front");
  });

  it("uses aiThemeText only for the themed face while retaining aiText and evidence", () => {
    const base = longCardRuntimeFromFixture(FIXTURES.supported_full);
    const input = {
      ...base,
      aiText: "## 理性说明\n\n理性正文",
      aiThemeText: "## 观象说明\n\n主题正文",
      narrative: undefined,
    };
    const markup = renderToStaticMarkup(createElement(LongCard, { input, reducedMotion: true }));
    const evidenceMarkup = renderToStaticMarkup(createElement(RationalEvidenceBack, {
      faceId: "evidence-face",
      active: true,
      input,
      headingId: "evidence-heading",
      headingRef: { current: null },
    }));

    expect(markup).toContain("<h2>观象说明</h2>");
    expect(markup).toContain("主题正文");
    expect(evidenceMarkup).toContain("<h2>理性说明</h2>");
    expect(evidenceMarkup).toContain("理性正文");
    expect(evidenceMarkup).toContain("本次分析用到的持仓");
    expect(evidenceMarkup).toContain("本次分析用到的行情证据");
    expect(markup).toContain('data-reduced-motion="true"');
    expect(markup.match(/class="mandong-long-card__face /g)).toHaveLength(2);
  });

  it("keeps a reduced-motion fallback, 680px axis, and vertical touch panning", () => {
    const stylesheet = readFileSync("src/features/long-card/LongCard.css", "utf8");
    expect(stylesheet).toContain("var(--content-reading)");
    expect(stylesheet).toContain("touch-action: pan-y");
    expect(stylesheet).toContain("display: block");
    expect(stylesheet).toContain("rotateY(180deg)");
    expect(stylesheet).toContain("pointer-events: none");
    expect(stylesheet).not.toContain("grid-area: 1 / 1");
    expect(stylesheet).toContain("transition: none");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain('data-reduced-motion="true"');
    expect(stylesheet).not.toContain("overflow-y: auto");
  });
});
