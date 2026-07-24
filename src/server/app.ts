import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVICE_NAME,
  type HealthResponse,
} from "../contracts/index.js";
import {
  WorkspaceService,
  createWorkspaceRoutes,
} from "../workspace/index.js";
import type { ServerConfig } from "./config.js";

const startedAt = Date.now();

function resolveClientRoot(moduleDir: string): string {
  return path.resolve(moduleDir, "../client");
}

export function createApp(
  config: ServerConfig,
  workspaceService: WorkspaceService = new WorkspaceService(),
): Hono {
  const app = new Hono();

  app.get("/health", (c) => {
    const body: HealthResponse = {
      status: "ok",
      service: SERVICE_NAME,
      version: config.version,
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1_000),
    };
    return c.json(body);
  });

  app.route("/api/workspaces", createWorkspaceRoutes(workspaceService));

  // Unknown /api/* must not fall through to SPA HTML (would look like enumeration).
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const clientRoot = resolveClientRoot(moduleDir);

  app.use(
    "/*",
    serveStatic({
      root: clientRoot,
      rewriteRequestPath: (requestPath) =>
        requestPath === "/" ? "/index.html" : requestPath,
    }),
  );

  app.notFound(async (c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "not_found" }, 404);
    }

    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      return c.json({ error: "not_found" }, 404);
    }

    const accept = c.req.header("accept") ?? "";
    const isDocumentRequest =
      accept === "" || accept.includes("text/html") || accept.includes("*/*");
    if (!isDocumentRequest || path.extname(c.req.path) !== "") {
      return c.json({ error: "not_found" }, 404);
    }

    try {
      const { readFile } = await import("node:fs/promises");
      const html = await readFile(path.join(clientRoot, "index.html"), "utf8");
      return c.html(html);
    } catch {
      return c.text("Client build not found. Run pnpm build first.", 503);
    }
  });

  return app;
}
