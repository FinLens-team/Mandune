import type { AssetClass, DraftLine } from "../contracts/index.js";

export type ExtractionOutcome =
  | "succeeded"
  | "failed"
  | "aborted"
  | "timeout";

export interface ExtractedHoldingCandidate {
  asset_class: AssetClass;
  name: string;
  symbol?: string;
  market?: string;
  size_basis?: string;
  observation_date?: string;
  confidence: "high" | "low";
  notes?: string;
}

export interface MultimodalExtractionResult {
  candidates: ExtractedHoldingCandidate[];
  model_notes?: string;
}

export interface MultimodalExtractor {
  extract(input: {
    image_bytes: Uint8Array;
    media_type: string;
    signal?: AbortSignal;
  }): Promise<MultimodalExtractionResult>;
}

export interface DeletionAuditEvent {
  event_id: string;
  image_id: string;
  outcome: ExtractionOutcome;
  deleted: true;
  deleted_at: string;
  /** Never include image bytes or base64. */
  reason: string;
}

export interface ScreenshotImportResult {
  ok: boolean;
  outcome: ExtractionOutcome;
  draft_lines: DraftLine[];
  message: string;
  deletion: DeletionAuditEvent;
}
