/**
 * Analysis conclusions, directional advice, result envelope, and long-card data.
 */

import type {
  AnalysisResultStatus,
  DirectionalAdviceKind,
  IsoDateString,
  IsoDateTimeString,
  ProvenanceKind,
} from "./common.js";
import type { DerivedResult, EvidenceRecord } from "./evidence.js";
import type {
  PersonalConstraints,
  PortfolioSnapshot,
} from "./portfolio.js";

export interface MaterialReference {
  /** Confirmed input, derived result, or verified evidence id. */
  ref_id: string;
  kind: "confirmed_input" | "derived" | "evidence";
}

export interface Conclusion {
  id: string;
  statement: string;
  provenance: ProvenanceKind;
  /** Material conclusions require at least one supporting ref. */
  refs: MaterialReference[];
  affected_by_unknowns: boolean;
  limited_by?: string[];
}

export interface DirectionalAdvice {
  id: string;
  kind: DirectionalAdviceKind;
  /** Qualitative direction only; validators reject exact trade instructions. */
  statement: string;
  /** Holding / constraint / derived / evidence triggers. */
  trigger_refs: MaterialReference[];
  urgency: "routine" | "attention";
}

export interface CoverageReport {
  covered_line_ids: string[];
  uncovered_line_ids: string[];
  unsupported_line_ids: string[];
  missing_metrics: string[];
}

export interface UnknownItem {
  id: string;
  subject: string;
  reason: string;
  impact: string;
}

export interface RiskNote {
  id: string;
  statement: string;
  /** Standard product boundary notice; never excuses out-of-policy advice. */
  is_boundary_notice: boolean;
  refs?: MaterialReference[];
}

/** Theme narrative front — expression only; must not alter rational payload. */
export interface NarrativeFrontPresentation {
  theme_id: string;
  headline: string;
  body_paragraphs: string[];
  mascot_mood: string;
  guidance_summary: string;
}

/** Rational evidence back — invariant across themes. */
export interface EvidenceBackPresentation {
  derivation_summary: string;
  concept_explanations: string[];
  standard_risk_notice: string;
}

/**
 * Full analysis result bound to one snapshot and evidence cutoff.
 * Front/back presentation placeholders share this rational core.
 */
export interface AnalysisResult {
  contracts_version: string;
  analysis_id: string;
  snapshot_id: string;
  status: AnalysisResultStatus;
  analysis_started_at: IsoDateTimeString;
  analysis_completed_at: IsoDateTimeString;
  latest_complete_trading_day: IsoDateString;
  evidence_cutoff_at: IsoDateTimeString;
  theme_id: string;
  coverage: CoverageReport;
  constraints: PersonalConstraints;
  conclusions: Conclusion[];
  advice: DirectionalAdvice[];
  evidence: EvidenceRecord[];
  derived: DerivedResult[];
  unknowns: UnknownItem[];
  assumptions: string[];
  limitations: string[];
  risk_notes: RiskNote[];
  recovery_actions?: string[];
}

/**
 * Long-card data sufficient to present the daily review report.
 * Unavailable status should not be rendered as a normal card.
 */
export interface LongCardData {
  contracts_version: string;
  card_id: string;
  analysis_id: string;
  status: Exclude<AnalysisResultStatus, "unavailable">;
  snapshot: PortfolioSnapshot;
  analysis_started_at: IsoDateTimeString;
  analysis_completed_at: IsoDateTimeString;
  latest_complete_trading_day: IsoDateString;
  evidence_cutoff_at: IsoDateTimeString;
  coverage: CoverageReport;
  constraints: PersonalConstraints;
  conclusions: Conclusion[];
  advice: DirectionalAdvice[];
  evidence_refs: string[];
  unknowns: UnknownItem[];
  risk_notes: RiskNote[];
  front: NarrativeFrontPresentation;
  back: EvidenceBackPresentation;
  is_example: boolean;
  example_label?: string;
}
