import type {
  MultimodalExtractionResult,
  MultimodalExtractor,
} from "./types.js";

/**
 * Deterministic extractor for tests and offline demos.
 * Interprets a tiny text protocol embedded in UTF-8 image bytes for fixtures:
 * - "CLEAR:..." lines become high-confidence holdings
 * - "BLUR" => empty / low quality
 * - "THROW" => model failure
 */
export class MockMultimodalExtractor implements MultimodalExtractor {
  async extract(input: {
    image_bytes: Uint8Array;
    media_type: string;
    signal?: AbortSignal;
  }): Promise<MultimodalExtractionResult> {
    if (input.signal?.aborted) {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }

    const text = new TextDecoder().decode(input.image_bytes);
    if (text.includes("THROW")) {
      throw new Error("multimodal_model_failed");
    }
    if (text.includes("BLUR")) {
      return { candidates: [], model_notes: "image_too_blurry" };
    }

    if (text.startsWith("CLEAR:")) {
      // CLEAR:etf|示例ETF|510300.SH|中等
      const payload = text.slice("CLEAR:".length).trim();
      const [asset_class, name, symbol, size_basis] = payload.split("|");
      return {
        candidates: [
          {
            asset_class: (asset_class as "etf" | "fund" | "a_share") || "etf",
            name: name || "未识别名称",
            symbol: symbol || undefined,
            size_basis: size_basis || undefined,
            confidence: symbol && size_basis ? "high" : "low",
          },
        ],
      };
    }

    return {
      candidates: [
        {
          asset_class: "etf",
          name: "截图识别示例行",
          symbol: undefined,
          size_basis: undefined,
          confidence: "low",
          notes: "字段不完整，需用户确认",
        },
      ],
      model_notes: "partial_extraction",
    };
  }
}
