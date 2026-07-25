import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATLAS_GENERATION_POLICY_VERSION, selectAtlasKind } from "../../src/atlas/index.js";
import { deriveAnalysisInputs } from "../../src/analysis/derivations.js";
import {
  DAILY_REVIEW_MODEL_ID,
  DAILY_REVIEW_PROMPT_VERSION,
  compileDailyReviewPrompt,
  personaForTheme,
} from "../../src/analysis/prompt-compiler.js";
import { buildReviewPacket } from "../../src/analysis/review-packet.js";
import { getFixture } from "../../src/fixtures/index.js";

const EXPECTED_HASHES = {
  "持仓分析-skill.md": "f5a1b033b40a5cee50890999d853b46c9831077d69812ead9d0e410df2bf1676",
  "奶龙转述-skill.md": "6f24172abb08bb5aa1fa04e76a403db2406b69017fd82421cf32dc61ada3bf2d",
  "孙哥转述-skill.md": "a6aa654bb8ffe45c72c11ea572e055ed6e175ee88f01e0ca4849ef269ce8eb68",
  "兜兜转述-玄学版-skill.md": "af14f077d03719e4d9158b3ebc7113bed36e926f3fad9e74a5b9b7f6838012b5",
} as const;

describe("daily review prompt compiler", () => {
  it("maps every supported frontend theme id to the intended backend persona", () => {
    expect(personaForTheme("eastern_observation")).toBe("nailong");
    expect(personaForTheme("nailong")).toBe("nailong");
    expect(personaForTheme("sun_ge")).toBe("sunge");
  });

  it("keeps every FINAL skill byte-identical to the reviewed intake", () => {
    for (const [fileName, expected] of Object.entries(EXPECTED_HASHES)) {
      const body = readFileSync(new URL(`../../src/analysis/skills-v1/${fileName}`, import.meta.url));
      expect(createHash("sha256").update(body).digest("hex")).toBe(expected);
    }
  });

  it("separates rational and persona instructions while keeping untouched skills behind application constraints", () => {
    const fixture = structuredClone(getFixture("supported_full"));
    const personaId = personaForTheme(fixture.snapshot.theme_id);
    const derivations = deriveAnalysisInputs({
      snapshot: fixture.snapshot,
      evidence: fixture.analysis.evidence,
      latestCompleteTradingDay: fixture.analysis.latest_complete_trading_day,
    });
    const packet = buildReviewPacket({
      analysisId: fixture.analysis.analysis_id,
      snapshot: fixture.snapshot,
      latestCompleteTradingDay: fixture.analysis.latest_complete_trading_day,
      evidenceCutoffAt: fixture.analysis.evidence_cutoff_at,
      personaId,
      evidence: fixture.analysis.evidence,
      derivations,
      selectedAtlasKind: selectAtlasKind(fixture.analysis.analysis_id),
      existingAtlasCards: [],
    });

    const compiled = compileDailyReviewPrompt(packet, personaId);

    expect(compiled).toMatchObject({
      prompt_version: DAILY_REVIEW_PROMPT_VERSION,
      model_id: DAILY_REVIEW_MODEL_ID,
      persona_id: "nailong",
      atlas_policy_version: ATLAS_GENERATION_POLICY_VERSION,
      input: packet,
    });
    const rationalApplication = compiled.rational_instructions.indexOf("【应用级事实、安全和输出约束");
    const core = compiled.rational_instructions.indexOf("【核心持仓分析 skill｜原文】");
    const rationalInput = compiled.rational_instructions.indexOf("【输入说明】");
    expect(rationalApplication).toBeLessThan(core);
    expect(core).toBeLessThan(rationalInput);
    expect(compiled.rational_instructions).not.toContain("【当前人格 skill");

    const personaApplication = compiled.persona_instructions.indexOf("【应用级事实、安全和输出约束");
    const persona = compiled.persona_instructions.indexOf("【当前人格 skill：nailong｜原文】");
    const personaInput = compiled.persona_instructions.indexOf("【输入说明】");
    expect(personaApplication).toBeLessThan(persona);
    expect(persona).toBeLessThan(personaInput);
    expect(compiled.persona_instructions).not.toContain("【核心持仓分析 skill｜原文】");
    expect(compiled.rational_instructions).toContain("[FINAL — DO NOT MODIFY]");
    expect(compiled.persona_instructions).toContain("[FINAL — DO NOT MODIFY]");
    expect(compiled.rational_instructions).toContain("报告正文都不得包含“每日扫盲”");
    expect(compiled.persona_instructions).toContain("独立 Atlas 调用生成");
  });
});
