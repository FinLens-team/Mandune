import { adviceStatementIsAllowed, type AnalysisResult } from "../contracts/index.js";
import {
  ATLAS_APPEARANCES,
  ATLAS_CARD_SCHEMA_VERSION,
  ATLAS_CANDIDATE_SCHEMA_VERSION,
  ATLAS_CARD_KINDS,
  ATLAS_DOMAINS,
  type AtlasCandidate,
  type AtlasCardDetail,
  type AtlasCardKind,
  type AtlasCardV1,
  type AtlasEncounter,
  type AtlasOutcome,
} from "./types.js";

const TRADE_COMMAND = /(立即|马上|现在)?\s*(买入|卖出|建仓|清仓|加仓|减仓)/;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function safeText(value: unknown, max: number): value is string {
  return text(value, max) && adviceStatementIsAllowed(value) && !TRADE_COMMAND.test(value);
}

function strings(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => text(item, maxLength));
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function isAtlasCardKind(value: unknown): value is AtlasCardKind {
  return typeof value === "string" && (ATLAS_CARD_KINDS as readonly string[]).includes(value);
}

export function validateAtlasCandidate(
  value: unknown,
  expectedKind: AtlasCardKind,
  analysis: AnalysisResult,
  additionalReferenceIds: readonly string[] = [],
): value is AtlasCandidate {
  if (!object(value) || value.schema_version !== ATLAS_CANDIDATE_SCHEMA_VERSION || value.kind !== expectedKind) {
    return false;
  }
  if (!text(value.canonical_name, 40) || !strings(value.aliases, 8, 40) || !strings(value.scope_labels, 12, 60)) {
    return false;
  }
  if (value.generation_mode !== "model" && value.generation_mode !== "fixture") return false;

  if (expectedKind === "meme") {
    return onlyKeys(value, [
      "schema_version", "kind", "canonical_name", "aliases", "scope_labels",
      "generation_mode", "domain", "meme_text", "plain_explanation", "theme",
    ]) &&
      value.domain === null &&
      safeText(value.meme_text, 80) &&
      safeText(value.plain_explanation, 120) &&
      text(value.theme, 24);
  }

  const allowedReferences = new Set(
    [
      ...analysis.conclusions.flatMap((item) => item.refs.map((ref) => ref.ref_id)),
      ...additionalReferenceIds,
    ],
  );
  return onlyKeys(value, [
    "schema_version", "kind", "canonical_name", "aliases", "scope_labels",
    "generation_mode", "domain", "plain_explanation", "why_today", "relation",
    "misconception", "boundary", "reference_ids",
  ]) &&
    typeof value.domain === "string" &&
    (ATLAS_DOMAINS as readonly string[]).includes(value.domain) &&
    safeText(value.plain_explanation, 240) &&
    safeText(value.why_today, 240) &&
    safeText(value.relation, 240) &&
    safeText(value.misconception, 240) &&
    safeText(value.boundary, 240) &&
    strings(value.reference_ids, 16, 160) &&
    value.reference_ids.length > 0 &&
    value.reference_ids.every((reference) => allowedReferences.has(reference));
}

export function validateAtlasCard(value: unknown): value is AtlasCardV1 {
  if (!object(value) || value.schema_version !== ATLAS_CARD_SCHEMA_VERSION || !isAtlasCardKind(value.kind)) {
    return false;
  }
  if (
    !text(value.card_id, 160) ||
    !text(value.canonical_name, 40) ||
    !strings(value.aliases, 8, 40) ||
    !strings(value.scope_labels, 12, 60) ||
    !(ATLAS_APPEARANCES as readonly unknown[]).includes(value.appearance) ||
    !text(value.visual_seed, 64) ||
    !/^[a-f0-9]{16,64}$/.test(value.visual_seed) ||
    (value.generation_mode !== "model" && value.generation_mode !== "fixture") ||
    !text(value.first_discovered_at, 40) ||
    !text(value.last_encountered_at, 40) ||
    Number.isNaN(Date.parse(value.first_discovered_at)) ||
    Number.isNaN(Date.parse(value.last_encountered_at)) ||
    !text(value.first_analysis_id, 160) ||
    !text(value.first_history_record_id, 160) ||
    !Number.isInteger(value.encounter_count) ||
    Number(value.encounter_count) < 1
  ) return false;

  if (value.kind === "professional_term") {
    if (
      typeof value.domain !== "string" ||
      !(ATLAS_DOMAINS as readonly string[]).includes(value.domain) ||
      !object(value.professional) ||
      value.meme !== null
    ) return false;
    return safeText(value.professional.plain_explanation, 240) &&
      safeText(value.professional.why_today, 240) &&
      safeText(value.professional.relation, 240) &&
      safeText(value.professional.misconception, 240) &&
      safeText(value.professional.boundary, 240) &&
      strings(value.professional.reference_ids, 16, 160);
  }
  return value.domain === null &&
    value.professional === null &&
    object(value.meme) &&
    safeText(value.meme.meme_text, 80) &&
    safeText(value.meme.plain_explanation, 120) &&
    text(value.meme.theme, 24);
}

export function validateAtlasEncounter(value: unknown): value is AtlasEncounter {
  return object(value) &&
    text(value.encounter_id, 160) &&
    text(value.card_id, 160) &&
    text(value.analysis_id, 160) &&
    text(value.history_record_id, 160) &&
    text(value.occurred_at, 40) &&
    !Number.isNaN(Date.parse(value.occurred_at)) &&
    safeText(value.context_summary, 240) &&
    strings(value.reference_ids, 16, 160);
}

export function validateAtlasDetail(value: unknown): value is AtlasCardDetail {
  if (!object(value)) return false;
  const card = value.card;
  const encounters = value.encounters;
  return validateAtlasCard(card) &&
    Array.isArray(encounters) &&
    encounters.length >= 1 &&
    encounters.every((item) => validateAtlasEncounter(item) && item.card_id === card.card_id) &&
    encounters.length === card.encounter_count;
}

export function validateAtlasOutcome(value: unknown): value is AtlasOutcome {
  if (!object(value) || !text(value.analysis_id, 160) || !isAtlasCardKind(value.selected_kind)) return false;
  if (!["pending", "new_card", "encountered", "no_card", "failed"].includes(String(value.status))) return false;
  if (!text(value.created_at, 40) || Number.isNaN(Date.parse(value.created_at))) return false;
  if (value.completed_at !== undefined && (!text(value.completed_at, 40) || Number.isNaN(Date.parse(value.completed_at)))) return false;
  if (value.card_id !== undefined && !text(value.card_id, 160)) return false;
  if (value.cards !== undefined && (
    !Array.isArray(value.cards) ||
    value.cards.length < 1 ||
    value.cards.length > 4 ||
    value.cards.some((item) => !object(item) || !text(item.card_id, 160) ||
      (item.disposition !== "new_card" && item.disposition !== "encountered")) ||
    new Set(value.cards.map((item) => item.card_id)).size !== value.cards.length
  )) return false;
  if (value.reason !== undefined && ![
    "no_candidate", "dedupe_uncertain", "invalid_candidate", "timeout",
    "generation_failed", "storage_failed", "card_deleted",
  ].includes(String(value.reason))) return false;
  if ((value.status === "new_card" || value.status === "encountered") &&
    !text(value.card_id, 160) && !Array.isArray(value.cards)) return false;
  return true;
}

export function normalizeAtlasText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function bigrams(value: string): Set<string> {
  const normalized = normalizeAtlasText(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function dice(left: string, right: string): number {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

function candidateMeaning(candidate: AtlasCandidate): string {
  return candidate.kind === "professional_term"
    ? `${candidate.plain_explanation}${candidate.boundary}`
    : `${candidate.meme_text}${candidate.plain_explanation}`;
}

function cardMeaning(card: AtlasCardV1): string {
  return card.kind === "professional_term"
    ? `${card.professional?.plain_explanation ?? ""}${card.professional?.boundary ?? ""}`
    : `${card.meme?.meme_text ?? ""}${card.meme?.plain_explanation ?? ""}`;
}

export type AtlasDuplicateDecision =
  | { kind: "same"; card: AtlasCardV1 }
  | { kind: "different" }
  | { kind: "uncertain" };

export function decideAtlasDuplicate(
  candidate: AtlasCandidate,
  cards: readonly AtlasCardV1[],
): AtlasDuplicateDecision {
  let uncertain = false;
  const candidateNames = [candidate.canonical_name, ...candidate.aliases].map(normalizeAtlasText).filter(Boolean);
  for (const card of cards) {
    if (card.kind !== candidate.kind) continue;
    const cardNames = [card.canonical_name, ...card.aliases].map(normalizeAtlasText).filter(Boolean);
    if (candidateNames.some((name) => cardNames.includes(name))) return { kind: "same", card };
    const nameScore = Math.max(
      0,
      ...candidateNames.flatMap((left) => cardNames.map((right) => dice(left, right))),
    );
    const meaningScore = dice(candidateMeaning(candidate), cardMeaning(card));
    const score = nameScore * 0.7 + meaningScore * 0.3;
    if (score >= 0.82) return { kind: "same", card };
    if (score > 0.42) uncertain = true;
  }
  return uncertain ? { kind: "uncertain" } : { kind: "different" };
}
