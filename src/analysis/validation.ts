import {
  adviceStatementIsAllowed,
  DIRECTIONAL_ADVICE_KINDS,
  validateAnalysisResult,
  type AnalysisResult,
  type Conclusion,
  type CoverageReport,
  type DerivedResult,
  type DirectionalAdvice,
  type EvidenceRecord,
  type RiskNote,
  type UnknownItem,
  type ValidationIssue,
} from "../contracts/index.js";
import { hasPrivatePayload, type JsonSchema } from "../model/index.js";

export const RATIONAL_ANALYSIS_SCHEMA_VERSION = "rational-analysis.v1";
export const THEME_NARRATIVE_SCHEMA_VERSION = "theme-narrative.v1";

export interface RationalModelOutput {
  schema_version: typeof RATIONAL_ANALYSIS_SCHEMA_VERSION;
  conclusions: Conclusion[];
  advice: DirectionalAdvice[];
  assumptions: string[];
  limitations: string[];
  risk_notes: RiskNote[];
}

export interface ThemeModelOutput {
  schema_version: typeof THEME_NARRATIVE_SCHEMA_VERSION;
  rational_analysis_id: string;
  theme_id: string;
  headline: string;
  body_paragraphs: string[];
  mascot_mood: string;
  guidance_summary: string;
  conclusion_ids: string[];
  advice_ids: string[];
}

const REF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ref_id", "kind"],
  properties: {
    ref_id: { type: "string", minLength: 1 },
    kind: { enum: ["confirmed_input", "derived", "evidence"] },
  },
} as const;

export const RATIONAL_ANALYSIS_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "conclusions", "advice", "assumptions", "limitations", "risk_notes"],
  properties: {
    schema_version: { const: RATIONAL_ANALYSIS_SCHEMA_VERSION },
    conclusions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "statement", "provenance", "refs", "affected_by_unknowns"],
        properties: {
          id: { type: "string", minLength: 1 },
          statement: { type: "string", minLength: 1 },
          provenance: { const: "generated" },
          refs: { type: "array", minItems: 1, items: REF_SCHEMA },
          affected_by_unknowns: { type: "boolean" },
          limited_by: { type: "array", items: { type: "string" } },
        },
      },
    },
    advice: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "statement", "trigger_refs", "urgency"],
        properties: {
          id: { type: "string", minLength: 1 },
          kind: {
            enum: [
              "maintain_observation",
              "pause_adding",
              "reduce_concentration",
              "increase_liquidity_attention",
              "wait_for_data_confirmation",
              "review_constraints",
              "seek_human_judgment",
            ],
          },
          statement: { type: "string", minLength: 1 },
          trigger_refs: { type: "array", minItems: 1, items: REF_SCHEMA },
          urgency: { enum: ["routine", "attention"] },
        },
      },
    },
    assumptions: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
    risk_notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "statement", "is_boundary_notice"],
        properties: {
          id: { type: "string", minLength: 1 },
          statement: { type: "string", minLength: 1 },
          is_boundary_notice: { type: "boolean" },
          refs: { type: "array", items: REF_SCHEMA },
        },
      },
    },
  },
};

export const THEME_NARRATIVE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "rational_analysis_id",
    "theme_id",
    "headline",
    "body_paragraphs",
    "mascot_mood",
    "guidance_summary",
    "conclusion_ids",
    "advice_ids",
  ],
  properties: {
    schema_version: { const: THEME_NARRATIVE_SCHEMA_VERSION },
    rational_analysis_id: { type: "string", minLength: 1 },
    theme_id: { type: "string", minLength: 1 },
    headline: { type: "string", minLength: 1 },
    body_paragraphs: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    mascot_mood: { type: "string", minLength: 1 },
    guidance_summary: { type: "string", minLength: 1 },
    conclusion_ids: { type: "array", items: { type: "string", minLength: 1 } },
    advice_ids: { type: "array", items: { type: "string", minLength: 1 } },
  },
};

const FORBIDDEN_GENERATED_CONTENT = /(保证收益|稳赚|必涨|必跌|胜率\s*\d|代客操作|替你下单|持牌投资建议|吉凶|运势)/;
const FORBIDDEN_THEME_TRADE = /(买入|卖出|建仓|清仓|加仓|减仓)[^。；]{0,16}\d|目标价\s*\d|仓位[^。；]{0,8}\d+(\.\d+)?\s*%/;
const FORBIDDEN_TRADE_COMMAND = /(买入|卖出|建仓|清仓|加仓|减仓)/;
const FORBIDDEN_PREDICTION_OR_CAUSAL_CERTAINTY = /(明日|下个交易日|未来).{0,12}(上涨|下跌|涨|跌)|一定会|必然(导致|带来)|确保.{0,8}(收益|回报)/;
const SAFE_THEME_HEADLINES: Record<string, string> = {
  eastern_observation: "今日观象",
};
const SAFE_MASCOT_MOODS = new Set(["calm", "attentive", "reflective"]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}

function generatedTextIsAllowed(value: string): boolean {
  return adviceStatementIsAllowed(value) &&
    !FORBIDDEN_GENERATED_CONTENT.test(value) &&
    !FORBIDDEN_THEME_TRADE.test(value) &&
    !FORBIDDEN_TRADE_COMMAND.test(value) &&
    !FORBIDDEN_PREDICTION_OR_CAUSAL_CERTAINTY.test(value);
}

function normalizedEvidenceTime(value: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return parsed.toISOString().slice(0, 10) === value ? parsed.toISOString() : undefined;
  }
  if (!value.includes("T") || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function referenceIds(input: {
  lineIds: readonly string[];
  evidence: readonly EvidenceRecord[];
  derived: readonly DerivedResult[];
}): Map<string, "confirmed_input" | "derived" | "evidence"> {
  return new Map([
    ...input.lineIds.map((id) => [id, "confirmed_input"] as const),
    ...input.derived.map((item) => [item.id, "derived"] as const),
    ...input.evidence
      .filter((item) => item.status === "available" && item.metric_or_event_type !== "candidate_event")
      .map((item) => [item.id, "evidence"] as const),
  ]);
}

function refsAreValid(value: unknown, known: Map<string, string>): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((ref) =>
    object(ref) && hasOnlyKeys(ref, ["ref_id", "kind"]) && nonEmpty(ref.ref_id) && known.get(ref.ref_id) === ref.kind,
  );
}

export function validateRationalModelOutput(
  value: unknown,
  context: {
    lineIds: readonly string[];
    evidence: readonly EvidenceRecord[];
    derived: readonly DerivedResult[];
    coverage: CoverageReport;
    status: AnalysisResult["status"];
    unknowns: readonly UnknownItem[];
  },
): value is RationalModelOutput {
  if (!object(value) || hasPrivatePayload(value)) return false;
  if (!hasOnlyKeys(value, ["schema_version", "conclusions", "advice", "assumptions", "limitations", "risk_notes"])) return false;
  if (value.schema_version !== RATIONAL_ANALYSIS_SCHEMA_VERSION) return false;
  if (!Array.isArray(value.conclusions) || !Array.isArray(value.advice)) return false;
  if (!strings(value.assumptions) || !strings(value.limitations) || !Array.isArray(value.risk_notes)) return false;
  const known = referenceIds(context);
  const uniqueIds = (items: unknown[]): boolean => {
    const ids = items.flatMap((item) => object(item) && nonEmpty(item.id) ? [item.id] : []);
    return ids.length === items.length && new Set(ids).size === ids.length;
  };
  const conclusionsValid = value.conclusions.length > 0 && value.conclusions.every((item) =>
    object(item) && hasOnlyKeys(item, ["id", "statement", "provenance", "refs", "affected_by_unknowns"], ["limited_by"]) &&
    nonEmpty(item.id) && nonEmpty(item.statement) && item.provenance === "generated" &&
    typeof item.affected_by_unknowns === "boolean" && refsAreValid(item.refs, known) &&
    (item.limited_by === undefined || strings(item.limited_by)) &&
    generatedTextIsAllowed(item.statement),
  );
  const adviceValid = value.advice.length > 0 && value.advice.every((item) =>
    object(item) && hasOnlyKeys(item, ["id", "kind", "statement", "trigger_refs", "urgency"]) &&
    nonEmpty(item.id) && nonEmpty(item.statement) &&
    typeof item.kind === "string" && (DIRECTIONAL_ADVICE_KINDS as readonly string[]).includes(item.kind) &&
    (item.urgency === "routine" || item.urgency === "attention") &&
    generatedTextIsAllowed(item.statement) &&
    refsAreValid(item.trigger_refs, known),
  );
  const riskValid = value.risk_notes.length > 0 && value.risk_notes.every((item) =>
    object(item) && hasOnlyKeys(item, ["id", "statement", "is_boundary_notice"], ["refs"]) &&
    nonEmpty(item.id) && nonEmpty(item.statement) && generatedTextIsAllowed(item.statement) && typeof item.is_boundary_notice === "boolean" &&
    (item.refs === undefined || refsAreValid(item.refs, known)),
  ) && value.risk_notes.some((item) => object(item) && item.is_boundary_notice === true);
  if (!conclusionsValid || !adviceValid || !riskValid || !uniqueIds(value.conclusions) || !uniqueIds(value.advice) || !uniqueIds(value.risk_notes)) return false;
  if (![...value.assumptions, ...value.limitations].every(generatedTextIsAllowed)) return false;
  const hasUnknownConstraints = context.unknowns.some((item) => item.id.startsWith("unknown-constraint-"));
  if (hasUnknownConstraints) {
    const allowed = new Set(["maintain_observation", "wait_for_data_confirmation", "review_constraints", "seek_human_judgment"]);
    if (value.limitations.length === 0) return false;
    if (value.conclusions.some((item) =>
      !object(item) || item.affected_by_unknowns !== true || !strings(item.limited_by) || item.limited_by.length === 0
    )) return false;
    if (value.advice.some((item) => !object(item) || !allowed.has(String(item.kind)) || item.urgency !== "routine")) return false;
  }
  if (context.status === "observation_only") {
    const allowed = new Set(["maintain_observation", "wait_for_data_confirmation", "review_constraints", "seek_human_judgment"]);
    if (value.advice.some((item) => !object(item) || !allowed.has(String(item.kind)) || item.urgency !== "routine")) return false;
  }
  return true;
}

export function validateThemeModelOutput(
  value: unknown,
  rational: RationalModelOutput,
  expected: { analysisId: string; themeId: string },
): value is ThemeModelOutput {
  if (!object(value) || hasPrivatePayload(value)) return false;
  if (!hasOnlyKeys(value, [
    "schema_version", "rational_analysis_id", "theme_id", "headline", "body_paragraphs", "mascot_mood",
    "guidance_summary", "conclusion_ids", "advice_ids",
  ])) return false;
  if (
    value.schema_version !== THEME_NARRATIVE_SCHEMA_VERSION ||
    value.rational_analysis_id !== expected.analysisId ||
    value.theme_id !== expected.themeId ||
    !nonEmpty(value.headline) ||
    !strings(value.body_paragraphs) ||
    value.body_paragraphs.length === 0 ||
    !nonEmpty(value.mascot_mood) ||
    !nonEmpty(value.guidance_summary) ||
    !strings(value.conclusion_ids) ||
    !strings(value.advice_ids)
  ) return false;
  if (SAFE_THEME_HEADLINES[value.theme_id] !== value.headline || !SAFE_MASCOT_MOODS.has(value.mascot_mood)) return false;
  const expectedGuidance = rational.advice.map((item) => item.statement).join("；");
  if (value.guidance_summary !== expectedGuidance || !generatedTextIsAllowed(value.guidance_summary)) return false;
  if (![value.headline, ...value.body_paragraphs, value.mascot_mood].every(generatedTextIsAllowed)) return false;
  const conclusionStatements = rational.conclusions.map((item) => item.statement);
  const conclusionIds = rational.conclusions.map((item) => item.id);
  const adviceIds = rational.advice.map((item) => item.id);
  return JSON.stringify(value.body_paragraphs) === JSON.stringify(conclusionStatements) &&
    JSON.stringify(value.conclusion_ids) === JSON.stringify(conclusionIds) &&
    JSON.stringify(value.advice_ids) === JSON.stringify(adviceIds);
}

/**
 * Shared v1 validation incorrectly requires evidence observation timestamps to
 * include a clock. Validate semantic date-only values here, preserve them in the
 * result, and use a normalized validation copy only for the shared checker.
 */
export function validateOwnedAnalysisResult(value: AnalysisResult):
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const normalizedEvidence = value.evidence.map((item, index) => {
    const normalized = normalizedEvidenceTime(item.observation_or_event_time);
    if (!normalized) {
      issues.push({
        path: `evidence[${index}].observation_or_event_time`,
        code: "invalid_evidence_time",
        message: "Evidence time must be a semantic ISO date or datetime.",
      });
      return item;
    }
    if (Number.isNaN(Date.parse(item.fetched_at)) || !item.fetched_at.includes("T")) {
      issues.push({
        path: `evidence[${index}].fetched_at`,
        code: "invalid_fetched_at",
        message: "Fetched time must be an ISO datetime.",
      });
    }
    if (Date.parse(normalized) > Date.parse(value.evidence_cutoff_at)) {
      issues.push({
        path: `evidence[${index}].observation_or_event_time`,
        code: "after_evidence_cutoff",
        message: "Evidence observed after the frozen cutoff cannot enter this analysis.",
      });
    }
    return { ...item, observation_or_event_time: normalized };
  });
  const shared = validateAnalysisResult({ ...value, evidence: normalizedEvidence });
  if (!shared.ok) issues.push(...shared.issues);
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
