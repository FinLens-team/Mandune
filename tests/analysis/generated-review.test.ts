import { describe, expect, it } from "vitest";
import { ATLAS_CANDIDATE_SCHEMA_VERSION } from "../../src/atlas/index.js";
import { deriveAnalysisInputs } from "../../src/analysis/derivations.js";
import {
  GENERATED_DAILY_REVIEW_SCHEMA_VERSION,
  GENERATED_PERSONA_REPORT_SCHEMA_VERSION,
  GENERATED_RATIONAL_REPORT_SCHEMA_VERSION,
  generatedDailyReviewSchema,
  generatedPersonaReportSchema,
  generatedRationalReportSchema,
  validateGeneratedDailyReview,
  validateGeneratedPersonaReport,
  validateGeneratedRationalReport,
} from "../../src/analysis/generated-review.js";
import { buildReviewPacket } from "../../src/analysis/review-packet.js";
import { getFixture } from "../../src/fixtures/index.js";

function packet() {
  const fixture = structuredClone(getFixture("supported_full"));
  const derivations = deriveAnalysisInputs({
    snapshot: fixture.snapshot,
    evidence: fixture.analysis.evidence,
    latestCompleteTradingDay: fixture.analysis.latest_complete_trading_day,
  });
  return buildReviewPacket({
    analysisId: fixture.analysis.analysis_id,
    snapshot: fixture.snapshot,
    latestCompleteTradingDay: fixture.analysis.latest_complete_trading_day,
    evidenceCutoffAt: fixture.analysis.evidence_cutoff_at,
    personaId: "doudou",
    evidence: fixture.analysis.evidence,
    derivations,
    selectedAtlasKind: "professional_term",
    existingAtlasCards: [],
  });
}

function candidate(referenceId: string) {
  return {
    schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
    kind: "professional_term",
    canonical_name: "组合集中度",
    aliases: ["持仓集中度"],
    scope_labels: ["示例组合"],
    generation_mode: "model",
    domain: "portfolio",
    plain_explanation: "描述组合是否集中在少数持仓。",
    why_today: "用于解释本次已确认的组合观察。",
    relation: "对应本次复盘引用的集中度事实。",
    misconception: "集中不等于必然亏损。",
    boundary: "不能单独判断未来涨跌。",
    reference_ids: [referenceId],
  };
}

function output(referenceId: string) {
  return {
    schema_version: GENERATED_DAILY_REVIEW_SCHEMA_VERSION,
    rational_report: {
      markdown: "当前证据支持复盘组合变化，同时仍需保留未知边界。",
      fact_ids: [referenceId],
      event_ids: [],
    },
    persona_report: {
      persona_id: "doudou",
      markdown: "兜兜先看清已确认的组合变化，也把未知之处原样留着。",
      fact_ids: [referenceId],
      event_ids: [],
    },
    atlas_candidate: candidate(referenceId),
  };
}

describe("generated daily review v2", () => {
  it("validates the rational and persona envelopes independently", () => {
    const reviewPacket = packet();
    const referenceId = reviewPacket.fact_ids[0]!;
    const rationalEnvelope = {
      schema_version: GENERATED_RATIONAL_REPORT_SCHEMA_VERSION,
      rational_report: output(referenceId).rational_report,
    };
    const rational = validateGeneratedRationalReport(rationalEnvelope, reviewPacket);

    expect(generatedRationalReportSchema()).toMatchObject({
      properties: { schema_version: { const: GENERATED_RATIONAL_REPORT_SCHEMA_VERSION } },
    });
    expect(rational).toEqual(rationalEnvelope.rational_report);
    expect(generatedPersonaReportSchema("doudou")).toMatchObject({
      properties: {
        schema_version: { const: GENERATED_PERSONA_REPORT_SCHEMA_VERSION },
        persona_report: { properties: { persona_id: { const: "doudou" } } },
      },
    });
    expect(validateGeneratedPersonaReport({
      schema_version: GENERATED_PERSONA_REPORT_SCHEMA_VERSION,
      persona_report: output(referenceId).persona_report,
    }, reviewPacket, rational!)).toEqual(output(referenceId).persona_report);
  });

  it("publishes a versioned schema and accepts matching, cited reports", () => {
    const reviewPacket = packet();
    const referenceId = reviewPacket.fact_ids[0]!;

    expect(generatedDailyReviewSchema("doudou")).toMatchObject({
      properties: {
        schema_version: { const: GENERATED_DAILY_REVIEW_SCHEMA_VERSION },
        persona_report: { properties: { persona_id: { const: "doudou" } } },
      },
    });
    expect(validateGeneratedDailyReview(output(referenceId), reviewPacket)).toMatchObject({
      ok: true,
      value: { atlas_validation: "valid" },
    });
  });

  it.each([
    ["unknown reference", (value: ReturnType<typeof output>) => { value.rational_report.fact_ids = ["invented"]; }],
    ["different references", (value: ReturnType<typeof output>) => { value.persona_report.fact_ids = [packet().fact_ids[1]!]; }],
    ["new financial number", (value: ReturnType<typeof output>) => { value.rational_report.markdown += " 涨幅为 987654%。"; }],
    ["trade instruction", (value: ReturnType<typeof output>) => { value.persona_report.markdown += " 现在卖出。"; }],
    ["education section", (value: ReturnType<typeof output>) => { value.rational_report.markdown += " 每日扫盲。"; }],
    ["wrong persona", (value: ReturnType<typeof output>) => { value.persona_report.persona_id = "sunge"; }],
  ])("rejects the complete report for %s", (_label, mutate) => {
    const reviewPacket = packet();
    const value = output(reviewPacket.fact_ids[0]!);
    mutate(value);
    expect(validateGeneratedDailyReview(value, reviewPacket).ok).toBe(false);
  });

  it("keeps valid reports when only the Atlas candidate is invalid", () => {
    const reviewPacket = packet();
    const value = output(reviewPacket.fact_ids[0]!);
    value.atlas_candidate.reference_ids = ["invented-reference"];

    expect(validateGeneratedDailyReview(value, reviewPacket)).toMatchObject({
      ok: true,
      value: {
        atlas_candidate: null,
        atlas_validation: "invalid_candidate",
      },
    });
  });
});
