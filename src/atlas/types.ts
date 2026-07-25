import type { AnalysisResult, PortfolioSnapshot } from "../contracts/index.js";

export const ATLAS_CARD_SCHEMA_VERSION = "atlas-card.v1" as const;
export const ATLAS_CANDIDATE_SCHEMA_VERSION = "atlas-candidate.v1" as const;
export const ATLAS_CANDIDATE_BATCH_SCHEMA_VERSION = "atlas-candidate-batch.v1" as const;

export const ATLAS_CARD_KINDS = ["professional_term", "meme"] as const;
export type AtlasCardKind = (typeof ATLAS_CARD_KINDS)[number];

export const ATLAS_APPEARANCES = ["regular", "holographic", "collector"] as const;
export type AtlasAppearance = (typeof ATLAS_APPEARANCES)[number];

export const ATLAS_DOMAINS = [
  "risk",
  "portfolio",
  "valuation",
  "liquidity",
  "market_behavior",
  "market_cycle",
  "company_or_product_event",
  "other",
] as const;
export type AtlasDomain = (typeof ATLAS_DOMAINS)[number];

export type AtlasGenerationMode = "model" | "fixture";

export interface ProfessionalTermContent {
  plain_explanation: string;
  why_today: string;
  relation: string;
  misconception: string;
  boundary: string;
  reference_ids: string[];
}

export interface MemeContent {
  meme_text: string;
  plain_explanation: string;
  theme: string;
}

export interface AtlasCardV1 {
  schema_version: typeof ATLAS_CARD_SCHEMA_VERSION;
  card_id: string;
  kind: AtlasCardKind;
  canonical_name: string;
  aliases: string[];
  domain: AtlasDomain | null;
  scope_labels: string[];
  appearance: AtlasAppearance;
  visual_seed: string;
  generation_mode: AtlasGenerationMode;
  first_discovered_at: string;
  last_encountered_at: string;
  first_analysis_id: string;
  first_history_record_id: string;
  encounter_count: number;
  professional: ProfessionalTermContent | null;
  meme: MemeContent | null;
}

export interface AtlasEncounter {
  encounter_id: string;
  card_id: string;
  analysis_id: string;
  history_record_id: string;
  occurred_at: string;
  context_summary: string;
  reference_ids: string[];
}

export interface AtlasCardDetail {
  card: AtlasCardV1;
  encounters: AtlasEncounter[];
}

interface CandidateBase {
  schema_version: typeof ATLAS_CANDIDATE_SCHEMA_VERSION;
  kind: AtlasCardKind;
  canonical_name: string;
  aliases: string[];
  scope_labels: string[];
  generation_mode: AtlasGenerationMode;
}

export interface ProfessionalTermCandidate extends CandidateBase {
  kind: "professional_term";
  domain: AtlasDomain;
  plain_explanation: string;
  why_today: string;
  relation: string;
  misconception: string;
  boundary: string;
  reference_ids: string[];
}

export interface MemeCandidate extends CandidateBase {
  kind: "meme";
  domain: null;
  meme_text: string;
  plain_explanation: string;
  theme: string;
}

export type AtlasCandidate = ProfessionalTermCandidate | MemeCandidate;

export type AtlasOutcomeStatus = "pending" | "new_card" | "encountered" | "no_card" | "failed";

export interface AtlasOutcomeCard {
  card_id: string;
  disposition: "new_card" | "encountered";
}

export interface AtlasOutcome {
  analysis_id: string;
  selected_kind: AtlasCardKind;
  status: AtlasOutcomeStatus;
  created_at: string;
  completed_at?: string;
  cards?: AtlasOutcomeCard[];
  /** First card retained for clients and rows written before multi-card outcomes. */
  card_id?: string;
  reason?: "no_candidate" | "dedupe_uncertain" | "invalid_candidate" | "timeout" | "generation_failed" | "storage_failed" | "card_deleted";
}

export interface AtlasGenerationInput {
  analysis: AnalysisResult;
  existing_cards: AtlasCardV1[];
  include_meme?: boolean;
  max_candidates?: number;
  report_markdown?: string;
  snapshot: PortfolioSnapshot;
  selected_kind: AtlasCardKind;
}

export interface AtlasCandidateGenerator {
  generate(input: AtlasGenerationInput, signal: AbortSignal): Promise<unknown | null>;
}

export interface StoredAtlasOutcome extends AtlasOutcome {
  workspace_id: string;
}

export interface StoredAtlasCard {
  workspace_id: string;
  canonical_key: string;
  card: AtlasCardV1;
}

export type AtlasCardCommitResult = "committed" | "run_closed" | "workspace_erased" | "conflict";

export interface AtlasStore {
  beginRun(outcome: StoredAtlasOutcome): Promise<{ created: boolean; outcome: StoredAtlasOutcome }>;
  completeRun(
    workspaceId: string,
    analysisId: string,
    update: Pick<AtlasOutcome, "status" | "completed_at" | "reason">,
  ): Promise<boolean>;
  createCard(
    record: StoredAtlasCard,
    encounter: AtlasEncounter,
    analysisId: string,
  ): Promise<AtlasCardCommitResult>;
  addEncounter(
    workspaceId: string,
    cardId: string,
    encounter: AtlasEncounter,
    analysisId: string,
  ): Promise<AtlasCardCommitResult>;
  getOutcome(workspaceId: string, analysisId: string): Promise<StoredAtlasOutcome | null>;
  listCards(workspaceId: string): Promise<AtlasCardV1[]>;
  getCard(workspaceId: string, cardId: string): Promise<AtlasCardDetail | null>;
  deleteCard(workspaceId: string, cardId: string): Promise<boolean>;
  eraseWorkspace(workspaceId: string): Promise<number>;
}
