import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import {
  EphemeralImageStore,
  ScreenshotExtractionService,
  TesseractOcrExtractor,
} from "./index.js";
import type { WorkspaceService } from "../workspace/index.js";
import { WORKSPACE_COOKIE } from "../workspace/index.js";

const ALLOWED_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const UNAUTHORIZED = { error: "unauthorized" } as const;

async function authorized(c: Context, workspaces: WorkspaceService, cookieName: string): Promise<boolean> {
  return (await workspaces.authorize(getCookie(c, cookieName))).ok;
}

export function createExtractionRoutes(input: {
  workspaces: WorkspaceService;
  cookieName?: string;
  service?: ScreenshotExtractionService;
}): Hono {
  const app = new Hono();
  const cookieName = input.cookieName ?? WORKSPACE_COOKIE;
  const service = input.service ?? new ScreenshotExtractionService(
    new EphemeralImageStore(),
    new TesseractOcrExtractor(),
  );

  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.post("/screenshot-ocr", async (c) => {
    if (!(await authorized(c, input.workspaces, cookieName))) return c.json(UNAUTHORIZED, 401);
    if (c.req.header("x-ocr-consent") !== "true") {
      return c.json({ error: "consent_required" }, 400);
    }
    const mediaType = (c.req.header("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
    if (!mediaType || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
      return c.json({ error: "unsupported_media_type" }, 415);
    }
    const contentLength = Number(c.req.header("content-length") ?? "0");
    if (!Number.isFinite(contentLength) || contentLength > MAX_IMAGE_BYTES) {
      return c.json({ error: "image_too_large" }, 413);
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0) return c.json({ error: "empty_image" }, 400);
    if (bytes.byteLength > MAX_IMAGE_BYTES) return c.json({ error: "image_too_large" }, 413);

    const result = await service.importScreenshot({
      consent_given: true,
      media_type: mediaType,
      image_bytes: bytes,
      signal: c.req.raw.signal,
    });
    return c.json(result, result.ok ? 200 : 422);
  });

  return app;
}
