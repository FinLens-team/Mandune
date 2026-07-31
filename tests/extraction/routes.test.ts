import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  EphemeralImageStore,
  MockMultimodalExtractor,
  ScreenshotExtractionService,
  createExtractionRoutes,
} from "../../src/extraction/index.js";
import { MemoryWorkspaceStore, WorkspaceService } from "../../src/workspace/index.js";

async function fixture() {
  const workspaces = new WorkspaceService(new MemoryWorkspaceStore());
  const created = await workspaces.create();
  const service = new ScreenshotExtractionService(
    new EphemeralImageStore(),
    new MockMultimodalExtractor(),
  );
  const app = new Hono();
  app.route("/api", createExtractionRoutes({ workspaces, service }));
  return {
    app,
    cookie: `__Host-md_workspace=${created.record.locator}`,
  };
}

describe("screenshot OCR routes", () => {
  it("requires a valid workspace cookie", async () => {
    const { app } = await fixture();
    const response = await app.request("http://localhost/api/screenshot-ocr", {
      method: "POST",
      headers: { "content-type": "image/png", "x-ocr-consent": "true" },
      body: "CLEAR:etf|沪深300ETF|510300.SH|仓位 20%",
    });
    expect(response.status).toBe(401);
  });

  it("requires explicit consent and supported media", async () => {
    const { app, cookie } = await fixture();
    const noConsent = await app.request("http://localhost/api/screenshot-ocr", {
      method: "POST",
      headers: { cookie, "content-type": "image/png" },
      body: "image",
    });
    expect(noConsent.status).toBe(400);
    expect(await noConsent.json()).toEqual({ error: "consent_required" });

    const badMedia = await app.request("http://localhost/api/screenshot-ocr", {
      method: "POST",
      headers: { cookie, "content-type": "text/plain", "x-ocr-consent": "true" },
      body: "image",
    });
    expect(badMedia.status).toBe(415);
  });

  it("returns unconfirmed screenshot draft lines without image bytes", async () => {
    const { app, cookie } = await fixture();
    const response = await app.request("http://localhost/api/screenshot-ocr", {
      method: "POST",
      headers: { cookie, "content-type": "image/png", "x-ocr-consent": "true" },
      body: "CLEAR:etf|沪深300ETF|510300.SH|仓位 20%",
    });
    expect(response.status).toBe(200);
    const result = await response.json() as {
      draft_lines: Array<{ symbol: string; entry_method: string }>;
      deletion: { deleted: boolean };
    };
    expect(result.draft_lines).toMatchObject([{
      symbol: "510300.SH",
      entry_method: "screenshot_extract",
    }]);
    expect(result.deletion.deleted).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/CLEAR:|image_bytes|base64/i);
  });
});
