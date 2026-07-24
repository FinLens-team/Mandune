/** Framework-neutral shared primitives for contracts. */

export type IsoDateTimeString = string;
export type IsoDateString = string;
export type NonEmptyString = string;

export type AssetClass = "fund" | "etf" | "a_share";

export type EntryMethod = "example" | "manual" | "screenshot_extract";

export type UnknownFieldState = "unknown" | "not_decided";

export type ProvenanceKind = "observed" | "derived" | "generated";

export type AnalysisResultStatus =
  | "supported"
  | "limited"
  | "observation_only"
  | "unavailable";

export type EvidenceStatus =
  | "available"
  | "stale"
  | "ambiguous"
  | "unsupported"
  | "conflicting"
  | "rate_limited"
  | "failed"
  | "unverified";

export type TaskEventStage =
  | "validate_snapshot"
  | "resolve_assets"
  | "fetch_structured_data"
  | "discover_and_verify_events"
  | "derive_exposure_and_constraints"
  | "form_conclusions_and_advice"
  | "render_theme_and_validate_output"
  | "persist_or_return";

export type TaskEventState =
  | "pending"
  | "running"
  | "retrying"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export type DirectionalAdviceKind =
  | "maintain_observation"
  | "pause_adding"
  | "reduce_concentration"
  | "increase_liquidity_attention"
  | "wait_for_data_confirmation"
  | "review_constraints"
  | "seek_human_judgment";

export interface SourceLocator {
  name: string;
  locator: string;
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface ValidationResult<T> {
  ok: true;
  value: T;
}

export interface ValidationFailure {
  ok: false;
  issues: ValidationIssue[];
}

export type ValidateResult<T> = ValidationResult<T> | ValidationFailure;

export const ASSET_CLASSES = ["fund", "etf", "a_share"] as const;
export const ENTRY_METHODS = [
  "example",
  "manual",
  "screenshot_extract",
] as const;
export const UNKNOWN_FIELD_STATES = ["unknown", "not_decided"] as const;
export const PROVENANCE_KINDS = ["observed", "derived", "generated"] as const;
export const ANALYSIS_RESULT_STATUSES = [
  "supported",
  "limited",
  "observation_only",
  "unavailable",
] as const;
export const EVIDENCE_STATUSES = [
  "available",
  "stale",
  "ambiguous",
  "unsupported",
  "conflicting",
  "rate_limited",
  "failed",
  "unverified",
] as const;
export const TASK_EVENT_STAGES = [
  "validate_snapshot",
  "resolve_assets",
  "fetch_structured_data",
  "discover_and_verify_events",
  "derive_exposure_and_constraints",
  "form_conclusions_and_advice",
  "render_theme_and_validate_output",
  "persist_or_return",
] as const;
export const TASK_EVENT_STATES = [
  "pending",
  "running",
  "retrying",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
] as const;
export const DIRECTIONAL_ADVICE_KINDS = [
  "maintain_observation",
  "pause_adding",
  "reduce_concentration",
  "increase_liquidity_attention",
  "wait_for_data_confirmation",
  "review_constraints",
  "seek_human_judgment",
] as const;
