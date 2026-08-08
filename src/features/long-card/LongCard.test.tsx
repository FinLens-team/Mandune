import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../fixtures/index.js";
import {
  Constraints,
  LongCard,
  RationalEvidenceBack,
  longCardRuntimeFromFixture,
  longCardRuntimeIsDisplayable,
  preserveFaceScrollOffsets,
  stripGeneratedRiskNotices,
} from "./LongCard.js";

describe("long-card rendering and interaction boundaries", () => {
  it("renders a keyboard-accessible summary and defers the analysis details", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.limited_partial);
    const markup = renderToStaticMarkup(createElement(LongCard, { input }));
    expect(markup).toContain('aria-label="每日复盘报告内容，按左右方向键切换报告与分析详情。"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("查看分析详情");
    expect(markup).not.toContain("随机体验身份 · 示例数据");
    expect(markup).not.toContain("有限分析");
    expect(markup).not.toContain("部分证据缺口限制了结论范围");
    expect(markup).not.toContain("本次分析用到的行情证据");
    expect(markup).toContain("AI 分析仅供信息整理与理解参考，不对投资决策或结果负责；请自行判断与操作。");
    expect(markup.match(/class="mandong-long-card__face /g)).toHaveLength(1);
    expect(markup).toContain("mandong-long-card__front");
    expect(markup).toContain('data-face="narrative"');
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

  it("keeps detailed holdings, constraints, and evidence behind one collapsed control", () => {
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
    expect(markup).toContain("查看本次分析依据");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("确认输入与覆盖");
    expect(markup).not.toContain("四项个人约束");
    expect(markup).not.toContain("观察证据与核验状态");
    expect(markup).not.toContain(fixture.analysis.evidence[0]!.source.locator);
  });

  it("shows all four personal constraints as simple rows without front-end pagination", () => {
    const input = longCardRuntimeFromFixture(FIXTURES.supported_full);
    const markup = renderToStaticMarkup(createElement(Constraints, { constraints: input.analysis.constraints }));

    expect(markup).toContain("投资期限");
    expect(markup).toContain("近期流动性需求");
    expect(markup).toContain("可承受回撤");
    expect(markup).toContain("投资目标");
    expect(markup).not.toContain("上一页");
    expect(markup).not.toContain("下一页");
    expect(markup).not.toContain("个人约束分页");
  });

  it("does not expose raw unknown constraint values while analysis materials are collapsed", () => {
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
    expect(markup).toContain("查看本次分析依据");
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
    expect(markup.match(/class="mandong-long-card__face /g)).toHaveLength(1);
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
    expect(evidenceMarkup).toContain("查看本次分析依据");
    expect(evidenceMarkup).not.toContain("本次分析用到的持仓");
    expect(evidenceMarkup).not.toContain("本次分析用到的行情证据");
    expect(markup).toContain('data-reduced-motion="true"');
    expect(markup.match(/class="mandong-long-card__face /g)).toHaveLength(1);
  });

  it("suppresses model-added disclaimers and keeps one product-owned footer", () => {
    const duplicateNotice = "⚠️ 免责声明：本报告仅作分析展示，不构成投资建议。";
    expect(stripGeneratedRiskNotices(`正文保留。\n\n${duplicateNotice}`)).toBe("正文保留。");

    const base = longCardRuntimeFromFixture(FIXTURES.supported_full);
    const input = {
      ...base,
      aiText: `## 理性说明\n\n理性正文。\n\n${duplicateNotice}`,
      aiThemeText: `## 角色说明\n\n角色正文。\n\n${duplicateNotice}`,
      narrative: undefined,
    };
    const frontMarkup = renderToStaticMarkup(createElement(LongCard, { input }));
    const backMarkup = renderToStaticMarkup(createElement(RationalEvidenceBack, {
      faceId: "evidence-face",
      active: true,
      input,
      headingId: "evidence-heading",
      headingRef: { current: null },
    }));

    for (const markup of [frontMarkup, backMarkup]) {
      expect(markup).not.toContain(duplicateNotice);
      expect(markup.match(/AI 分析仅供信息整理与理解参考/gu)).toHaveLength(1);
    }
    expect(frontMarkup).toContain("角色正文");
    expect(backMarkup).toContain("理性正文");
  });

  it("keeps very long model reports in normal document flow", () => {
    const base = longCardRuntimeFromFixture(FIXTURES.supported_full);
    const input = {
      ...base,
      aiText: `${"# 长报告\n\n正文段落。\n\n".repeat(300)}`,
      narrative: undefined,
    };
    const markup = renderToStaticMarkup(createElement(LongCard, { input }));

    expect(markup).toContain('data-long-content="true"');
  });

  it("uses the server evidence cursor rather than slicing a client-side evidence array", () => {
    const component = readFileSync("src/features/long-card/LongCard.tsx", "utf8");
    const stylesheet = readFileSync("src/features/long-card/LongCard.css", "utf8");

    expect(component).toContain("reader.getAnalysisEvidencePage");
    expect(component).toContain("reader.getAnalysisHoldingsPage");
    expect(component).toContain("next_cursor");
    expect(component).not.toContain("analysis.evidence.map");
    expect(component).not.toContain("snapshot.lines.map");
    expect(component).not.toContain("evidence.slice(");
    expect(stylesheet).toContain("mandong-long-card__pagination");
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
