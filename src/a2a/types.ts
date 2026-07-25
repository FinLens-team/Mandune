import type {
  AnalysisResultStatus,
  EvidenceRecord,
  PortfolioSnapshot,
} from "../contracts/index.js";
import type { AnalysisDerivations } from "../analysis/index.js";

export const A2A_PROTOCOL_VERSION = "1.0";
export const A2A_DEEP_REVIEW_SCHEMA_VERSION = "mandong.a2a.deep-review.v1";
export const A2A_DEEP_REVIEW_PROVIDER = "Volcano Ark";
export const A2A_DEEP_REVIEW_MODEL_NAME = "DeepSeek-Pro";
export const A2A_DEEP_REVIEW_ENDPOINT_ID = "ep-20260708162855-pcf9x";
/** OpenAI-compatible requests use the Ark endpoint ID as the model value. */
export const A2A_DEEP_REVIEW_MODEL_ID = A2A_DEEP_REVIEW_ENDPOINT_ID;
export const A2A_DEEP_REVIEW_DEADLINE_MS = 15 * 60 * 1_000;
export const A2A_DEEP_REVIEW_LOOP_BUDGET_MS = 13 * 60 * 1_000 + 30 * 1_000;
export const A2A_DEEP_REVIEW_MAX_STEPS = 8;
export const A2A_RISK_NOTICE =
  "本结果仅用于基于已确认输入和可核验证据的方向性复盘，不构成投资建议、收益保证或交易指令；用户保留最终判断和操作权。";

export interface DeepReviewInput {
  task: string;
  snapshot?: PortfolioSnapshot;
  signal: AbortSignal;
}

export interface DeepReviewToolTrace {
  name: "inspect_context" | "collect_market_evidence" | "derive_portfolio" | "finalize";
  status: "succeeded" | "rejected" | "failed";
  started_at: string;
  completed_at: string;
  summary: string;
}

export interface DeepReviewFinalDraft {
  summary: string;
  observations: string[];
  unknowns: string[];
  limitations: string[];
}

export interface DeepReviewDataSourceSummary {
  name: string;
  evidence_ids: string[];
  statuses: EvidenceRecord["status"][];
}

export type DeepReviewStopReason =
  | "finalized"
  | "completed"
  | "step_limit"
  | "loop_timeout"
  | "deadline"
  | "cancelled"
  | "model_failure";

export interface DeepReviewOutput {
  schema_version: typeof A2A_DEEP_REVIEW_SCHEMA_VERSION;
  status: AnalysisResultStatus;
  provider: typeof A2A_DEEP_REVIEW_PROVIDER;
  model: typeof A2A_DEEP_REVIEW_MODEL_NAME;
  endpoint_id: typeof A2A_DEEP_REVIEW_ENDPOINT_ID;
  started_at: string;
  completed_at: string;
  deadline_ms: typeof A2A_DEEP_REVIEW_DEADLINE_MS;
  stop_reason: DeepReviewStopReason;
  context: {
    task: string;
    snapshot_id: string | null;
    holdings: Array<{
      line_id: string;
      asset_class: PortfolioSnapshot["lines"][number]["asset_class"];
      name: string;
      symbol: string;
      observation_date: string;
    }>;
    constraints: PortfolioSnapshot["constraints"] | null;
  };
  evidence: EvidenceRecord[];
  /** Distinct server-side tools attempted during this request. Detailed status stays in execution.tools. */
  skills_used: DeepReviewToolTrace["name"][];
  /** Evidence providers actually represented in the final evidence set. */
  data_sources: DeepReviewDataSourceSummary[];
  derivations: AnalysisDerivations | null;
  final: DeepReviewFinalDraft;
  /** Server-owned product boundary; the model cannot remove or rewrite it. */
  risk_notice: typeof A2A_RISK_NOTICE;
  execution: {
    steps: number;
    tools: DeepReviewToolTrace[];
  };
}

export interface DeepReviewRunner {
  run(input: DeepReviewInput): Promise<DeepReviewOutput>;
}
