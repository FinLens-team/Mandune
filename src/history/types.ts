import type {
  AnalysisResult,
  AnalysisResultStatus,
  PortfolioSnapshot,
} from "../contracts/index.js";
import type { ThemeModelOutput } from "../analysis/index.js";

export const HISTORY_SCHEMA_VERSION = "analysis-history.v1" as const;

export interface HistoryVersions {
  history_schema: string;
  contracts: string;
  rational_analysis: string;
  theme_narrative: string | null;
}

export interface HistoryRecordV1 {
  schema_version: typeof HISTORY_SCHEMA_VERSION;
  record_id: string;
  snapshot: PortfolioSnapshot;
  analysis: AnalysisResult;
  rational_analysis_version: string;
  theme_narrative_version: string | null;
  narrative?: ThemeModelOutput;
}

/**
 * Storage metadata remains readable without decoding a versioned payload. This
 * lets callers show an honest unsupported-version state instead of re-running
 * an old analysis against current providers.
 */
export interface StoredHistoryEnvelope {
  workspace_id: string;
  record_id: string;
  analysis_id: string;
  snapshot_id: string;
  analysis_completed_at: string;
  evidence_cutoff_at: string;
  result_status: AnalysisResultStatus;
  theme_id: string;
  versions: HistoryVersions;
  payload_json: string;
}

export type HistoryReadability = "readable" | "unsupported_version";

export interface HistorySummary {
  record_id: string;
  analysis_id: string;
  snapshot_id: string;
  analysis_completed_at: string;
  evidence_cutoff_at: string;
  result_status: AnalysisResultStatus;
  theme_id: string;
  narrative_status: "available" | "not_generated";
  versions: HistoryVersions;
  readability: HistoryReadability;
}

export type HistoryVersionComponent =
  | "history_schema"
  | "contracts"
  | "rational_analysis"
  | "theme_narrative";

export interface UnsupportedHistoryVersion {
  component: HistoryVersionComponent;
  version: string;
}

export type HistoryReadResult =
  | { status: "found"; record: HistoryRecordV1 }
  | { status: "not_found"; code: "not_found" }
  | {
      status: "unsupported_version";
      summary: HistorySummary;
      unsupported_versions: UnsupportedHistoryVersion[];
    }
  | { status: "unreadable"; summary: HistorySummary; code: "invalid_record" }
  | { status: "unavailable"; code: "storage_failure" };

export type HistoryReplayResult =
  | { status: "replayed"; source: "immutable_history"; record: HistoryRecordV1 }
  | Exclude<HistoryReadResult, { status: "found" }>;

export type HistorySaveErrorCode =
  | "invalid_workspace"
  | "invalid_snapshot"
  | "invalid_result"
  | "version_mismatch"
  | "snapshot_mismatch"
  | "theme_mismatch"
  | "commit_fenced"
  | "record_conflict"
  | "workspace_deleted"
  | "storage_failure";

export class HistorySaveError extends Error {
  constructor(readonly code: HistorySaveErrorCode) {
    super(`History record could not be saved (${code}).`);
    this.name = "HistorySaveError";
  }
}

export class HistoryAccessError extends Error {
  constructor() {
    super("History storage operation failed.");
    this.name = "HistoryAccessError";
  }
}
