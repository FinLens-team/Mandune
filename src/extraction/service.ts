import type { DraftLine } from "../contracts/index.js";
import { withUsability } from "../portfolio/usability.js";
import { createId } from "./ids.js";
import { EphemeralImageStore } from "./image-store.js";
import { MockMultimodalExtractor } from "./mock-extractor.js";
import type {
  DeletionAuditEvent,
  ExtractedHoldingCandidate,
  MultimodalExtractor,
  ScreenshotImportResult,
} from "./types.js";

export interface ScreenshotImportInput {
  /** User must explicitly consent before upload is processed. */
  consent_given: boolean;
  media_type: string;
  image_bytes: Uint8Array;
  signal?: AbortSignal;
}

function toDraftLine(candidate: ExtractedHoldingCandidate): DraftLine {
  return withUsability({
    line_id: createId("line"),
    asset_class: candidate.asset_class,
    name: candidate.name,
    symbol: candidate.symbol ?? "unknown",
    market: candidate.market,
    size_basis: candidate.size_basis ?? "unknown",
    observation_date: candidate.observation_date ?? "unknown",
    entry_method: "screenshot_extract",
    notes: candidate.notes,
  });
}

function audit(
  imageId: string,
  outcome: DeletionAuditEvent["outcome"],
  reason: string,
): DeletionAuditEvent {
  return {
    event_id: createId("del"),
    image_id: imageId,
    outcome,
    deleted: true,
    deleted_at: new Date().toISOString(),
    reason,
  };
}

/**
 * Consent → store image → extract → map draft lines → always delete image.
 * Never returns or logs image bytes / base64.
 */
export class ScreenshotExtractionService {
  constructor(
    private readonly images: EphemeralImageStore = new EphemeralImageStore(),
    private readonly extractor: MultimodalExtractor = new MockMultimodalExtractor(),
  ) {}

  async importScreenshot(
    input: ScreenshotImportInput,
  ): Promise<ScreenshotImportResult> {
    if (!input.consent_given) {
      return {
        ok: false,
        outcome: "aborted",
        draft_lines: [],
        message: "需要先确认截图将交给多模态模型提取，并可能包含敏感金融信息。",
        deletion: audit("none", "aborted", "consent_not_given"),
      };
    }

    if (!input.image_bytes || input.image_bytes.byteLength === 0) {
      return {
        ok: false,
        outcome: "failed",
        draft_lines: [],
        message: "未收到截图内容。",
        deletion: audit("none", "failed", "empty_image"),
      };
    }

    const stored = this.images.put(input.media_type, input.image_bytes);
    let outcome: DeletionAuditEvent["outcome"] = "failed";
    let draftLines: DraftLine[] = [];
    let message = "提取失败";

    try {
      if (input.signal?.aborted) {
        outcome = "aborted";
        message = "用户中止提取；原图已删除。";
      } else {
        const result = await this.extractor.extract({
          image_bytes: stored.bytes,
          media_type: stored.media_type,
          signal: input.signal,
        });
        draftLines = result.candidates.map(toDraftLine);
        outcome = "succeeded";
        message =
          draftLines.length > 0
            ? `已生成 ${draftLines.length} 条待复核草稿（未自动确认）。`
            : "未能识别可用持仓行；可重传或改用手工录入。";
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        outcome = "aborted";
        message = "用户中止提取；原图已删除。";
      } else if (error instanceof Error && /timeout/i.test(error.message)) {
        outcome = "timeout";
        message = "提取超时；原图已删除，可重试或手工录入。";
      } else {
        outcome = "failed";
        message = "模型提取失败；原图已删除，草稿未自动确认。";
      }
    } finally {
      this.images.delete(stored.image_id);
    }

    const deletion = audit(stored.image_id, outcome, message);
    // Hard guarantee: image is gone
    if (this.images.has(stored.image_id)) {
      this.images.delete(stored.image_id);
    }

    return {
      ok: outcome === "succeeded" && draftLines.length > 0,
      outcome,
      draft_lines: draftLines,
      message,
      deletion,
    };
  }

  /** Test helper */
  imageStoreSize(): number {
    return this.images.size();
  }
}
