import type { AtlasCardKind, AtlasCardV1 } from "../atlas/types.js";
import type {
  DerivedResult,
  EvidenceRecord,
  PersonalConstraints,
  PortfolioSnapshot,
} from "../contracts/index.js";
import type { AnalysisDerivations } from "./derivations.js";

export const REVIEW_PACKET_SCHEMA_VERSION = "review-packet.v2" as const;

export interface ReviewPacketAtlasFingerprint {
  card_id: string;
  kind: AtlasCardKind;
  canonical_name: string;
  aliases: string[];
  domain: string | null;
  core_meaning: string;
}

export interface ReviewPacketNumber {
  source_id: string;
  value: number;
  unit?: string;
}

export interface ReviewPacketV2 {
  schema_version: typeof REVIEW_PACKET_SCHEMA_VERSION;
  analysis_id: string;
  snapshot_id: string;
  latest_complete_trading_day: string;
  evidence_cutoff_at: string;
  persona_id: string;
  holdings: PortfolioSnapshot["lines"];
  constraints: PersonalConstraints;
  evidence: EvidenceRecord[];
  derived: DerivedResult[];
  coverage: AnalysisDerivations["coverage"];
  unknowns: AnalysisDerivations["unknowns"];
  limitations: string[];
  fact_ids: string[];
  event_ids: string[];
  allowed_numbers: ReviewPacketNumber[];
  atlas: {
    selected_kind: AtlasCardKind;
    existing_cards: ReviewPacketAtlasFingerprint[];
  };
}

function atlasFingerprint(card: AtlasCardV1): ReviewPacketAtlasFingerprint {
  return {
    card_id: card.card_id,
    kind: card.kind,
    canonical_name: card.canonical_name,
    aliases: [...card.aliases],
    domain: card.domain,
    core_meaning: card.kind === "professional_term"
      ? `${card.professional?.plain_explanation ?? ""} ${card.professional?.boundary ?? ""}`.trim()
      : `${card.meme?.meme_text ?? ""} ${card.meme?.plain_explanation ?? ""}`.trim(),
  };
}

function allowedNumbers(
  snapshot: PortfolioSnapshot,
  evidence: readonly EvidenceRecord[],
  derived: readonly DerivedResult[],
): ReviewPacketNumber[] {
  const numbers: ReviewPacketNumber[] = [];
  for (const item of evidence) {
    const unit = item.unit?.trim();
    if (item.status === "available" && item.metric_or_event_type !== "candidate_event" &&
      unit && unit.toLowerCase() !== "unknown" && unit !== "未知" &&
      typeof item.value === "number" && Number.isFinite(item.value)) {
      numbers.push({ source_id: item.id, value: item.value, ...(item.unit ? { unit: item.unit } : {}) });
    }
  }
  for (const item of derived) {
    if (typeof item.value === "number" && Number.isFinite(item.value)) {
      numbers.push({ source_id: item.id, value: item.value, ...(item.unit ? { unit: item.unit } : {}) });
    }
  }
  for (const line of snapshot.lines) {
    const percentage = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(line.size_basis)?.[1];
    if (percentage !== undefined) {
      numbers.push({ source_id: line.line_id, value: Number(percentage), unit: "%" });
    }
  }
  return numbers.sort((left, right) => {
    const id = left.source_id.localeCompare(right.source_id);
    return id !== 0 ? id : left.value - right.value;
  });
}

function compactEvidenceForModel(
  evidence: readonly EvidenceRecord[],
  derived: readonly DerivedResult[],
): EvidenceRecord[] {
  const referenced = new Set(derived.flatMap((item) => item.evidence_refs));
  const recentBySeries = new Map<string, EvidenceRecord[]>();
  for (const item of evidence) {
    if (item.scope.kind !== "asset" || (item.metric_or_event_type !== "close" && item.metric_or_event_type !== "nav") ||
      typeof item.value !== "number") continue;
    const key = `${item.scope.line_id}\u0000${item.metric_or_event_type}\u0000${item.source.name}`;
    const rows = recentBySeries.get(key) ?? [];
    rows.push(item);
    recentBySeries.set(key, rows);
  }
  for (const rows of recentBySeries.values()) {
    rows.sort((left, right) => left.observation_or_event_time.localeCompare(right.observation_or_event_time));
    for (const item of rows.slice(-3)) referenced.add(item.id);
  }
  return evidence.filter((item) =>
    referenced.has(item.id) || item.metric_or_event_type === "verified_event" ||
    item.status === "failed" || item.status === "unsupported" || item.status === "stale" ||
    item.status === "conflicting" || item.status === "unverified",
  );
}

export function buildReviewPacket(input: {
  analysisId: string;
  snapshot: PortfolioSnapshot;
  latestCompleteTradingDay: string;
  evidenceCutoffAt: string;
  personaId: string;
  evidence: readonly EvidenceRecord[];
  derivations: AnalysisDerivations;
  selectedAtlasKind: AtlasCardKind;
  existingAtlasCards: readonly AtlasCardV1[];
}): ReviewPacketV2 {
  const derived = structuredClone([...input.derivations.derived].sort((left, right) => left.id.localeCompare(right.id)));
  const evidence = structuredClone(compactEvidenceForModel(input.evidence, derived)
    .sort((left, right) => left.id.localeCompare(right.id)));
  const factIds = [
    ...input.snapshot.lines.map((line) => line.line_id),
    ...Object.keys(input.snapshot.constraints).map((key) => `constraint:${key}`),
    ...evidence.filter((item) => item.metric_or_event_type !== "candidate_event").map((item) => item.id),
    ...derived.map((item) => item.id),
  ];
  const eventIds = evidence
    .filter((item) => item.metric_or_event_type === "verified_event" && item.status === "available")
    .map((item) => item.id);
  return {
    schema_version: REVIEW_PACKET_SCHEMA_VERSION,
    analysis_id: input.analysisId,
    snapshot_id: input.snapshot.snapshot_id,
    latest_complete_trading_day: input.latestCompleteTradingDay,
    evidence_cutoff_at: input.evidenceCutoffAt,
    persona_id: input.personaId,
    holdings: structuredClone(input.snapshot.lines),
    constraints: structuredClone(input.snapshot.constraints),
    evidence,
    derived,
    coverage: structuredClone(input.derivations.coverage),
    unknowns: structuredClone(input.derivations.unknowns),
    limitations: [...input.derivations.limitations],
    fact_ids: [...new Set(factIds)].sort(),
    event_ids: [...new Set(eventIds)].sort(),
    allowed_numbers: allowedNumbers(input.snapshot, evidence, derived),
    atlas: {
      selected_kind: input.selectedAtlasKind,
      existing_cards: input.existingAtlasCards
        .filter((card) => card.kind === input.selectedAtlasKind)
        .map(atlasFingerprint)
        .sort((left, right) => left.card_id.localeCompare(right.card_id)),
    },
  };
}
