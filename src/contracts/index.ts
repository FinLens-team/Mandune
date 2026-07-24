/**
 * Framework-neutral shared contracts for Demo V1.
 * Keep free of UI, provider SDKs, and storage engines.
 */

export const SERVICE_NAME = "mandong" as const;

export interface HealthResponse {
  status: "ok";
  service: typeof SERVICE_NAME;
  version: string;
  uptime_seconds: number;
}

export { CONTRACTS_VERSION, type ContractsVersion } from "./version.js";

export type {
  AnalysisResultStatus,
  AssetClass,
  DirectionalAdviceKind,
  EntryMethod,
  EvidenceStatus,
  IsoDateString,
  IsoDateTimeString,
  ProvenanceKind,
  SourceLocator,
  TaskEventStage,
  TaskEventState,
  UnknownFieldState,
  ValidateResult,
  ValidationFailure,
  ValidationIssue,
  ValidationResult,
} from "./common.js";

export {
  ANALYSIS_RESULT_STATUSES,
  ASSET_CLASSES,
  DIRECTIONAL_ADVICE_KINDS,
  ENTRY_METHODS,
  EVIDENCE_STATUSES,
  PROVENANCE_KINDS,
  TASK_EVENT_STAGES,
  TASK_EVENT_STATES,
  UNKNOWN_FIELD_STATES,
} from "./common.js";

export type {
  ConfirmedLine,
  DraftLine,
  PersonalConstraints,
  PortfolioDraft,
  PortfolioSnapshot,
} from "./portfolio.js";

export type {
  DerivedResult,
  EvidenceRecord,
  EvidenceScope,
} from "./evidence.js";

export type {
  AnalysisResult,
  Conclusion,
  CoverageReport,
  DirectionalAdvice,
  EvidenceBackPresentation,
  LongCardData,
  MaterialReference,
  NarrativeFrontPresentation,
  RiskNote,
  UnknownItem,
} from "./analysis.js";

export type { TaskEvent } from "./task-event.js";

export {
  adviceStatementIsAllowed,
  scanPrivacy,
  validateAnalysisResult,
  validateLongCardData,
  validatePortfolioDraft,
  validatePortfolioSnapshot,
  validateTaskEvent,
} from "./validate.js";
