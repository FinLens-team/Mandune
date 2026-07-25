import {
  ATLAS_CANDIDATE_SCHEMA_VERSION,
  ATLAS_DOMAINS,
  type AtlasCandidate,
} from "../atlas/types.js";
import { hasPrivatePayload } from "../model/privacy.js";
import type { JsonSchema } from "../model/gateway.js";
import type { DailyReviewPersonaId } from "./prompt-compiler.js";
import type { ReviewPacketV2 } from "./review-packet.js";

export const GENERATED_DAILY_REVIEW_SCHEMA_VERSION = "generated-daily-review.v2" as const;

export interface GeneratedReportV2 {
  markdown: string;
  fact_ids: string[];
  event_ids: string[];
}

export interface GeneratedPersonaReportV2 extends GeneratedReportV2 {
  persona_id: DailyReviewPersonaId;
}

export interface ValidatedGeneratedDailyReviewV2 {
  schema_version: typeof GENERATED_DAILY_REVIEW_SCHEMA_VERSION;
  rational_report: GeneratedReportV2;
  persona_report: GeneratedPersonaReportV2;
  atlas_candidate: AtlasCandidate | null;
  atlas_validation: "valid" | "no_candidate" | "invalid_candidate";
}

export type GeneratedDailyReviewValidation =
  | { ok: true; value: ValidatedGeneratedDailyReviewV2 }
  | { ok: false; errors: string[] };

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["markdown", "fact_ids", "event_ids"],
  properties: {
    markdown: { type: "string", minLength: 1, maxLength: 20_000 },
    fact_ids: {
      type: "array",
      minItems: 1,
      maxItems: 256,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    event_ids: {
      type: "array",
      maxItems: 128,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
  },
} as const;

export function generatedDailyReviewSchema(personaId: DailyReviewPersonaId): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "rational_report", "persona_report", "atlas_candidate"],
    properties: {
      schema_version: { type: "string", const: GENERATED_DAILY_REVIEW_SCHEMA_VERSION },
      rational_report: REPORT_SCHEMA,
      persona_report: {
        ...REPORT_SCHEMA,
        required: ["persona_id", ...REPORT_SCHEMA.required],
        properties: {
          persona_id: { type: "string", const: personaId },
          ...REPORT_SCHEMA.properties,
        },
      },
      // Atlas validation is deliberately independent so an invalid card cannot
      // discard two otherwise valid reports.
      atlas_candidate: {
        anyOf: [
          { type: "object" },
          { type: "null" },
        ],
      },
    },
  };
}

const FORBIDDEN_REPORT_CONTENT: RegExp[] = [
  /每日扫盲|知识卡|术语卡|趣味梗卡/,
  /(?:立即|马上|现在)?\s*(?:买入|卖出|建仓|清仓|加仓|减仓|申购|赎回|调仓|下单)/,
  /(?:目标价|价格点位|买卖时点|交易时点)/,
  /(?:保证|确保|承诺).{0,12}(?:收益|回报|盈利|不亏|胜率)|(?:稳赚|必赚|保本|必涨|必跌|稳赢)/,
  /(?:代客操作|替你下单|自动下单|执行交易|持牌投资建议|专业投资建议)/,
  /(?:明日|下个交易日|未来).{0,20}(?:上涨|下跌|涨|跌)|(?:一定会|必然).{0,16}(?:上涨|下跌|获利|盈利)/,
  /(?:吉凶|运势|天命|卦象).{0,16}(?:预测|预示|决定|证明|意味着).{0,20}(?:市场|涨|跌|收益|交易)/,
  /(?:reasoning|chain[ -]?of[ -]?thought|思维过程|推理过程)/i,
];

const ARABIC_NUMBER = /(?<![A-Za-z_])[-+]?\d+(?:\.\d+)?(?![A-Za-z_])/g;
const FORBIDDEN_ATLAS_CONTENT: RegExp[] = [
  /(?:立即|马上|现在)?\s*(?:买入|卖出|建仓|清仓|加仓|减仓|申购|赎回|调仓|下单)/,
  /(?:保证|确保|承诺).{0,12}(?:收益|回报|盈利|不亏|胜率)|(?:稳赚|必赚|保本|必涨|必跌|稳赢)/,
  /(?:代客操作|替你下单|自动下单|执行交易|持牌投资建议|专业投资建议)/,
  /(?:reasoning|chain[ -]?of[ -]?thought|思维过程|推理过程)/i,
];

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function text(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function strings(value: unknown, minimum: number, maximum: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum &&
    value.every((item) => text(item, maxLength)) && new Set(value).size === value.length;
}

function idsAreAllowed(ids: readonly string[], allowed: ReadonlySet<string>): boolean {
  return ids.every((id) => allowed.has(id));
}

function normalizedIds(ids: readonly string[]): string[] {
  return [...ids].sort();
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const a = normalizedIds(left);
  const b = normalizedIds(right);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function numberIsAllowed(raw: string, packet: ReviewPacketV2): boolean {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return false;
  return packet.allowed_numbers.some((item) => Object.is(item.value, parsed) || item.value === parsed);
}

function markdownIsSafe(markdown: string, packet: ReviewPacketV2): boolean {
  if (hasPrivatePayload(markdown) || FORBIDDEN_REPORT_CONTENT.some((pattern) => pattern.test(markdown))) return false;
  const numbers = markdown.match(ARABIC_NUMBER) ?? [];
  return numbers.every((number) => numberIsAllowed(number, packet));
}

function report(value: unknown, packet: ReviewPacketV2, persona = false): GeneratedReportV2 | GeneratedPersonaReportV2 | null {
  if (!object(value)) return null;
  const keys = persona ? ["persona_id", "markdown", "fact_ids", "event_ids"] : ["markdown", "fact_ids", "event_ids"];
  if (!onlyKeys(value, keys) || !text(value.markdown, 20_000) ||
    !strings(value.fact_ids, 1, 256, 160) || !strings(value.event_ids, 0, 128, 160)) return null;
  if (!idsAreAllowed(value.fact_ids, new Set(packet.fact_ids)) ||
    !idsAreAllowed(value.event_ids, new Set(packet.event_ids)) || !markdownIsSafe(value.markdown, packet)) return null;
  if (persona) {
    if (value.persona_id !== packet.persona_id) return null;
    return {
      persona_id: value.persona_id as DailyReviewPersonaId,
      markdown: value.markdown,
      fact_ids: [...value.fact_ids],
      event_ids: [...value.event_ids],
    };
  }
  return { markdown: value.markdown, fact_ids: [...value.fact_ids], event_ids: [...value.event_ids] };
}

function safeAtlasText(value: unknown, maxLength: number): value is string {
  return text(value, maxLength) && !hasPrivatePayload(value) &&
    !FORBIDDEN_ATLAS_CONTENT.some((pattern) => pattern.test(value));
}

function atlasCandidate(value: unknown, packet: ReviewPacketV2): AtlasCandidate | null {
  if (!object(value) || value.schema_version !== ATLAS_CANDIDATE_SCHEMA_VERSION ||
    value.kind !== packet.atlas.selected_kind || value.generation_mode !== "model" ||
    !safeAtlasText(value.canonical_name, 40) || !strings(value.aliases, 0, 8, 40) ||
    !strings(value.scope_labels, 0, 12, 60)) return null;

  if (value.kind === "meme") {
    if (!onlyKeys(value, [
      "schema_version", "kind", "canonical_name", "aliases", "scope_labels", "generation_mode",
      "domain", "meme_text", "plain_explanation", "theme",
    ]) || value.domain !== null || !safeAtlasText(value.meme_text, 80) ||
      !safeAtlasText(value.plain_explanation, 120) || !safeAtlasText(value.theme, 24)) return null;
    return structuredClone(value) as unknown as AtlasCandidate;
  }

  if (!onlyKeys(value, [
    "schema_version", "kind", "canonical_name", "aliases", "scope_labels", "generation_mode",
    "domain", "plain_explanation", "why_today", "relation", "misconception", "boundary", "reference_ids",
  ]) || typeof value.domain !== "string" || !(ATLAS_DOMAINS as readonly string[]).includes(value.domain) ||
    !safeAtlasText(value.plain_explanation, 240) || !safeAtlasText(value.why_today, 240) ||
    !safeAtlasText(value.relation, 240) || !safeAtlasText(value.misconception, 240) ||
    !safeAtlasText(value.boundary, 240) || !strings(value.reference_ids, 1, 16, 160) ||
    !idsAreAllowed(value.reference_ids, new Set([...packet.fact_ids, ...packet.event_ids]))) return null;
  return structuredClone(value) as unknown as AtlasCandidate;
}

export function validateGeneratedDailyReview(
  value: unknown,
  packet: ReviewPacketV2,
): GeneratedDailyReviewValidation {
  const errors: string[] = [];
  if (!object(value) || !onlyKeys(value, [
    "schema_version", "rational_report", "persona_report", "atlas_candidate",
  ])) return { ok: false, errors: ["invalid_root"] };
  if (value.schema_version !== GENERATED_DAILY_REVIEW_SCHEMA_VERSION) errors.push("invalid_schema_version");
  const rational = report(value.rational_report, packet);
  const persona = report(value.persona_report, packet, true);
  if (!rational) errors.push("invalid_rational_report");
  if (!persona) errors.push("invalid_persona_report");
  if (rational && persona && (!sameIds(rational.fact_ids, persona.fact_ids) ||
    !sameIds(rational.event_ids, persona.event_ids))) errors.push("report_reference_mismatch");
  if (!rational || !persona || errors.length > 0) return { ok: false, errors };

  const candidate = value.atlas_candidate === null ? null : atlasCandidate(value.atlas_candidate, packet);
  return {
    ok: true,
    value: {
      schema_version: GENERATED_DAILY_REVIEW_SCHEMA_VERSION,
      rational_report: rational,
      persona_report: persona as GeneratedPersonaReportV2,
      atlas_candidate: candidate,
      atlas_validation: value.atlas_candidate === null
        ? "no_candidate"
        : candidate ? "valid" : "invalid_candidate",
    },
  };
}

export function validateStoredGeneratedDailyReview(
  value: unknown,
  packet: ReviewPacketV2,
): value is ValidatedGeneratedDailyReviewV2 {
  if (!object(value) || !onlyKeys(value, [
    "schema_version", "rational_report", "persona_report", "atlas_candidate", "atlas_validation",
  ]) || value.schema_version !== GENERATED_DAILY_REVIEW_SCHEMA_VERSION ||
    (value.atlas_validation !== "valid" && value.atlas_validation !== "no_candidate" &&
      value.atlas_validation !== "invalid_candidate")) return false;
  const rational = report(value.rational_report, packet);
  const persona = report(value.persona_report, packet, true);
  if (!rational || !persona || !sameIds(rational.fact_ids, persona.fact_ids) ||
    !sameIds(rational.event_ids, persona.event_ids)) return false;
  if (value.atlas_validation === "valid") return atlasCandidate(value.atlas_candidate, packet) !== null;
  return value.atlas_candidate === null;
}
