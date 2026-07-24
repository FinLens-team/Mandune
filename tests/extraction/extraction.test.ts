import { describe, expect, it } from "vitest";
import {
  EphemeralImageStore,
  MockMultimodalExtractor,
  ScreenshotExtractionService,
} from "../../src/extraction/index.js";

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("screenshot extraction deletion guarantees", () => {
  it("requires consent and never keeps images without consent path", async () => {
    const service = new ScreenshotExtractionService();
    const result = await service.importScreenshot({
      consent_given: false,
      media_type: "image/png",
      image_bytes: encode("CLEAR:etf|示例|510300.SH|中等"),
    });
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("aborted");
    expect(service.imageStoreSize()).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/base64|CLEAR:|image_bytes/i);
  });

  it("maps clear fixtures to draft lines and deletes image on success", async () => {
    const store = new EphemeralImageStore();
    const service = new ScreenshotExtractionService(
      store,
      new MockMultimodalExtractor(),
    );
    const result = await service.importScreenshot({
      consent_given: true,
      media_type: "image/png",
      image_bytes: encode("CLEAR:etf|示例沪深300ETF|510300.SH|示例持仓规模：中等"),
    });
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("succeeded");
    expect(result.draft_lines).toHaveLength(1);
    expect(result.draft_lines[0]?.entry_method).toBe("screenshot_extract");
    expect(result.draft_lines[0]?.is_usable).toBe(true);
    expect(result.deletion.deleted).toBe(true);
    expect(store.size()).toBe(0);
    expect(store.has(result.deletion.image_id)).toBe(false);
  });

  it("deletes image on model failure and does not auto-confirm", async () => {
    const store = new EphemeralImageStore();
    const service = new ScreenshotExtractionService(store);
    const result = await service.importScreenshot({
      consent_given: true,
      media_type: "image/png",
      image_bytes: encode("THROW"),
    });
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("failed");
    expect(result.draft_lines).toHaveLength(0);
    expect(result.deletion.deleted).toBe(true);
    expect(store.size()).toBe(0);
  });

  it("deletes image on abort and keeps no bytes in audit", async () => {
    const store = new EphemeralImageStore();
    const service = new ScreenshotExtractionService(store);
    const controller = new AbortController();
    controller.abort();
    const result = await service.importScreenshot({
      consent_given: true,
      media_type: "image/png",
      image_bytes: encode("CLEAR:etf|示例|510300.SH|中等"),
      signal: controller.signal,
    });
    expect(result.outcome).toBe("aborted");
    expect(result.deletion.deleted).toBe(true);
    expect(store.size()).toBe(0);
    expect(JSON.stringify(result.deletion)).not.toMatch(/CLEAR:|Uint8Array|base64/i);
  });

  it("blurred images produce empty drafts without retaining storage", async () => {
    const store = new EphemeralImageStore();
    const service = new ScreenshotExtractionService(store);
    const result = await service.importScreenshot({
      consent_given: true,
      media_type: "image/png",
      image_bytes: encode("BLUR"),
    });
    expect(result.ok).toBe(false);
    expect(result.draft_lines).toHaveLength(0);
    expect(store.size()).toBe(0);
  });
});
