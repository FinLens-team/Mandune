import { createHash } from "node:crypto";
import type { ModelGateway } from "../model/index.js";
import {
  ATLAS_GENERATION_POLICY,
  ATLAS_GENERATION_POLICY_VERSION,
} from "./generation-policy.js";
import {
  ATLAS_CANDIDATE_SCHEMA_VERSION,
  ATLAS_DOMAINS,
  type AtlasCandidate,
  type AtlasCandidateGenerator,
  type AtlasGenerationInput,
  type MemeCandidate,
  type ProfessionalTermCandidate,
} from "./types.js";

const BASE_PROPERTIES = {
  schema_version: { type: "string", const: ATLAS_CANDIDATE_SCHEMA_VERSION },
  canonical_name: { type: "string", minLength: 1, maxLength: 40 },
  aliases: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 40 } },
  scope_labels: { type: "array", maxItems: 12, items: { type: "string", minLength: 1, maxLength: 60 } },
  generation_mode: { type: "string", const: "model" },
} as const;

const PROFESSIONAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version", "kind", "canonical_name", "aliases", "scope_labels", "generation_mode",
    "domain", "plain_explanation", "why_today", "relation", "misconception", "boundary", "reference_ids",
  ],
  properties: {
    ...BASE_PROPERTIES,
    kind: { type: "string", const: "professional_term" },
    domain: { type: "string", enum: ATLAS_DOMAINS },
    plain_explanation: { type: "string", minLength: 1, maxLength: 240 },
    why_today: { type: "string", minLength: 1, maxLength: 240 },
    relation: { type: "string", minLength: 1, maxLength: 240 },
    misconception: { type: "string", minLength: 1, maxLength: 240 },
    boundary: { type: "string", minLength: 1, maxLength: 240 },
    reference_ids: { type: "array", minItems: 1, maxItems: 16, items: { type: "string", minLength: 1, maxLength: 160 } },
  },
} as const;

const MEME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version", "kind", "canonical_name", "aliases", "scope_labels", "generation_mode",
    "domain", "meme_text", "plain_explanation", "theme",
  ],
  properties: {
    ...BASE_PROPERTIES,
    kind: { type: "string", const: "meme" },
    domain: { type: "null" },
    meme_text: { type: "string", minLength: 1, maxLength: 80 },
    plain_explanation: { type: "string", minLength: 1, maxLength: 120 },
    theme: { type: "string", minLength: 1, maxLength: 24 },
  },
} as const;

const CANDIDATES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      maxItems: 4,
      items: { anyOf: [PROFESSIONAL_SCHEMA, MEME_SCHEMA] },
    },
  },
} as const;

function safeModelInput(input: AtlasGenerationInput): unknown {
  const existingCards = input.existing_cards
    .map((card) => ({
      card_id: card.card_id,
      canonical_name: card.canonical_name,
      aliases: card.aliases,
      kind: card.kind,
      domain: card.domain,
      core_meaning: card.kind === "professional_term"
        ? `${card.professional?.plain_explanation ?? ""} ${card.professional?.boundary ?? ""}`.trim()
        : `${card.meme?.meme_text ?? ""} ${card.meme?.plain_explanation ?? ""}`.trim(),
    }));
  return {
    existing_cards: existingCards,
    include_meme: input.include_meme === true,
    max_candidates: Math.min(4, Math.max(0, input.max_candidates ?? 4)),
    report_markdown: input.report_markdown ?? "",
    theme_id: input.analysis.theme_id,
    review_status: input.analysis.status,
    portfolio_scope: input.snapshot.lines.map((line) => ({
      line_id: line.line_id,
      name: line.name,
      symbol: line.symbol,
      asset_class: line.asset_class,
    })),
    personal_boundaries: Object.entries(input.analysis.constraints).map(([name, value]) => ({ name, value })),
    conclusions: input.analysis.conclusions.map((item) => ({
      statement: item.statement,
      refs: item.refs,
      affected_by_unknowns: item.affected_by_unknowns,
    })),
    available_references: input.analysis.conclusions.flatMap((item) => item.refs),
  };
}

export class ModelAtlasCandidateGenerator implements AtlasCandidateGenerator {
  constructor(private readonly gateway: ModelGateway, private readonly timeoutMs = 14_000) {}

  async generate(input: AtlasGenerationInput, signal: AbortSignal): Promise<unknown | null> {
    const response = await this.gateway.generate<{ candidates: AtlasCandidate[] }>({
      operation: "atlas_multi_candidate",
      schemaVersion: ATLAS_CANDIDATE_SCHEMA_VERSION,
      schema: CANDIDATES_SCHEMA,
      instructions: `${ATLAS_GENERATION_POLICY_VERSION}\n${ATLAS_GENERATION_POLICY}`,
      input: safeModelInput(input),
      signal,
      timeoutMs: this.timeoutMs,
      temperature: 0.55,
      maxOutputTokens: 3_600,
    });
    return response.ok &&
      (response.finishReason === undefined || response.finishReason === "stop")
      ? response.value.candidates
      : null;
  }
}

type FixtureMeme = Pick<MemeCandidate, "canonical_name" | "meme_text" | "plain_explanation" | "theme" | "aliases">;

const COMMON_MEMES: readonly FixtureMeme[] = [
  { canonical_name: "情绪先坐下", meme_text: "数字还没说完，情绪先别抢麦。", plain_explanation: "先读完信息，再形成判断。", theme: "通用梗", aliases: ["别让情绪抢麦"] },
  { canonical_name: "未知不是空白", meme_text: "不知道就先写不知道，别给答案硬加戏。", plain_explanation: "把未知保留下来也是一种清楚。", theme: "通用梗", aliases: ["别给答案加戏"] },
];

const EASTERN_OBSERVATION_MEMES: readonly FixtureMeme[] = [
  { canonical_name: "兜兜先观后断", meme_text: "兜兜把小本本摊开：先看清，再下判断。", plain_explanation: "先核对今天能确认的内容。", theme: "兜兜玄学版", aliases: ["先观后断"] },
];

function pickIndex(value: string, modulo: number): number {
  return createHash("sha256").update(value).digest().readUInt32BE(0) % modulo;
}

export class FixtureAtlasCandidateGenerator implements AtlasCandidateGenerator {
  async generate(input: AtlasGenerationInput, signal: AbortSignal): Promise<AtlasCandidate[] | null> {
    if (signal.aborted) return null;
    const scopeLabels = input.snapshot.lines.map((line) => line.name).slice(0, 12);
    if (input.selected_kind === "meme") {
      const memes = [...EASTERN_OBSERVATION_MEMES, ...COMMON_MEMES];
      const selected = memes[pickIndex(`${input.analysis.analysis_id}:${input.snapshot.theme_id}`, memes.length)]!;
      return [{
        schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
        kind: "meme",
        domain: null,
        scope_labels: [],
        generation_mode: "fixture",
        ...selected,
      } satisfies MemeCandidate];
    }

    const conclusion = input.analysis.conclusions.find((item) => item.refs.length > 0);
    if (!conclusion) return null;
    const referenceIds = conclusion.refs.map((ref) => ref.ref_id);
    const candidates: AtlasCandidate[] = [{
      schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
      kind: "professional_term",
      canonical_name: "组合集中度",
      aliases: ["持仓集中度", "集中暴露"],
      scope_labels: scopeLabels,
      generation_mode: "fixture",
      domain: "portfolio",
      plain_explanation: "组合集中度描述资金或风险是否过多聚集在少数持仓或相近方向。",
      why_today: "本次复盘用它帮助理解组合变化为何可能集中影响少数持仓。",
      relation: conclusion.statement,
      misconception: "集中不等于一定会亏损，它只说明组合对少数方向更敏感。",
      boundary: "它不能单独判断未来涨跌，也不直接给出买卖时点。",
      reference_ids: referenceIds,
    } satisfies ProfessionalTermCandidate];
    if (input.include_meme) {
      const memes = [...EASTERN_OBSERVATION_MEMES, ...COMMON_MEMES];
      const selected = memes[pickIndex(`${input.analysis.analysis_id}:${input.snapshot.theme_id}`, memes.length)]!;
      candidates.push({
        schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
        kind: "meme",
        domain: null,
        scope_labels: [],
        generation_mode: "fixture",
        ...selected,
      });
    }
    return candidates.slice(0, input.max_candidates ?? 4);
  }
}
