/**
 * Typed evidence records with dual timestamps and provenance kinds.
 */

import type {
  EvidenceStatus,
  IsoDateString,
  IsoDateTimeString,
  ProvenanceKind,
  SourceLocator,
} from "./common.js";

export type EvidenceScope =
  | { kind: "asset"; line_id: string; symbol?: string }
  | { kind: "portfolio" }
  | { kind: "constraint"; constraint_key: string };

export interface EvidenceRecord {
  id: string;
  scope: EvidenceScope;
  /** Metric name (e.g. close) or event type (e.g. issuer_notice). */
  metric_or_event_type: string;
  value?: string | number | null;
  unit?: string;
  normalization_note?: string;
  source: SourceLocator;
  /** Market observation date/time or event publish time, preserving source precision. */
  observation_or_event_time: IsoDateTimeString | IsoDateString;
  /** When the system fetched this record (must not masquerade as observation). */
  fetched_at: IsoDateTimeString;
  status: EvidenceStatus;
  limitations: string[];
  /** Provenance of how this record entered the evidence set. */
  provenance: ProvenanceKind;
  conflict_with?: string[];
}

export interface DerivedResult {
  id: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
  /** Input line / evidence / constraint ids used in the derivation. */
  input_refs: string[];
  evidence_refs: string[];
  formula_or_rule: string;
  provenance: "derived";
}
