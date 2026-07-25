import type {
  AnalysisResult,
  PortfolioDraft,
  PortfolioSnapshot,
  TaskEvent,
} from "../../contracts/index.js";
import {
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  type ReviewPacketV2,
  type ThemeModelOutput,
  type ValidatedGeneratedDailyReviewV2,
} from "../../analysis/index.js";
import type { HistoryExperienceSource } from "../../history/index.js";

export const FIXTURE_NON_LIVE_LABEL = "示例 fixture（非实时）" as const;

export interface AnalysisSourceLabel {
  kind: "fixture" | "live" | "unavailable";
  is_live: boolean;
  label: string;
}

export interface AnalysisExecution {
  analysis: AnalysisResult;
  narrative?: ThemeModelOutput;
  /** Relaxed Demo mode: free-form rational report streamed to the client. */
  ai_text?: string;
  /** Relaxed Demo mode: observation-theme rewrite of the same report. */
  ai_theme_text?: string;
  review_packet?: ReviewPacketV2;
  generated_review?: ValidatedGeneratedDailyReviewV2;
  model_id?: string;
  prompt_version?: string;
  skill_versions?: { core: string; persona: string };
  atlas_policy_version?: string;
  rational_analysis_version: typeof RATIONAL_ANALYSIS_SCHEMA_VERSION;
  source: AnalysisSourceLabel;
}

export type AnalysisRunState = "queued" | "running" | "terminal";

export interface StoredAnalysisRun {
  workspace_id: string;
  analysis_id: string;
  snapshot: PortfolioSnapshot;
  /** Frozen when this server-owned run is created. */
  experience_source?: HistoryExperienceSource;
  state: AnalysisRunState;
  created_at: string;
  updated_at: string;
  terminal_reason?: string;
  retryable: boolean;
  execution?: AnalysisExecution;
}

export interface CreateRunResult {
  created: boolean;
  run: StoredAnalysisRun;
}

export interface JourneyStore {
  getDraft(workspaceId: string): Promise<PortfolioDraft | null>;
  putDraft(workspaceId: string, draft: PortfolioDraft): Promise<void>;
  createRun(run: StoredAnalysisRun): Promise<CreateRunResult>;
  markRunning(workspaceId: string, analysisId: string, updatedAt: string): Promise<boolean>;
  appendEvent(workspaceId: string, analysisId: string, event: TaskEvent): Promise<boolean>;
  completeRun(input: {
    workspaceId: string;
    analysisId: string;
    updatedAt: string;
    terminalReason: string;
    retryable: boolean;
    execution?: AnalysisExecution;
  }): Promise<boolean>;
  getRun(workspaceId: string, analysisId: string): Promise<StoredAnalysisRun | null>;
  listEvents(workspaceId: string, analysisId: string): Promise<TaskEvent[]>;
  recoverInterruptedRuns(recoveredAt: string): Promise<number>;
}

export interface AnalysisExecutor {
  execute(input: {
    workspaceId: string;
    analysisId: string;
    snapshot: PortfolioSnapshot;
    emit: (stage: TaskEvent["stage"], state: TaskEvent["state"], extra?: Partial<TaskEvent>) => void;
    now: () => Date;
    /** Relaxed Demo mode: receives incremental free-text deltas from the model. */
    onText?: (delta: string) => void;
  }): Promise<AnalysisExecution>;
}
