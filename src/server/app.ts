import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVICE_NAME,
  type HealthResponse,
} from "../contracts/index.js";
import {
  AtlasService,
  FixtureAtlasCandidateGenerator,
  MemoryAtlasStore,
  createAtlasRoutes,
} from "../atlas/index.js";
import {
  JourneyAnalysisService,
  MemoryJourneyStore,
  createJourneyRoutes,
} from "../app/server/index.js";
import { HistoryService } from "../history/index.js";
import { PersistenceError } from "../persistence/errors.js";
import {
  WorkspaceService,
  createWorkspaceRoutes,
} from "../workspace/index.js";
import type { ServerConfig } from "./config.js";
import { createA2ARoutes, type DeepReviewRunner } from "../a2a/index.js";

const startedAt = Date.now();

function resolveClientRoot(moduleDir: string): string {
  return path.resolve(moduleDir, "../client");
}

export function createApp(
  config: Pick<ServerConfig, "version"> & Partial<Pick<ServerConfig, "port">>,
  workspaceService: WorkspaceService = new WorkspaceService(),
  backend?: {
    history: HistoryService;
    journey: JourneyAnalysisService;
    atlas?: AtlasService;
    a2a?: {
      runner: DeepReviewRunner;
      bearerToken: string;
      publicBaseUrl?: string;
    };
  },
): Hono {
  const app = new Hono();
  const history = backend?.history ?? new HistoryService();
  const atlas = backend?.atlas ?? new AtlasService(
    new MemoryAtlasStore(),
    new FixtureAtlasCandidateGenerator(),
  );
  const journey = backend?.journey ?? new JourneyAnalysisService(
    new MemoryJourneyStore(),
    history,
    undefined,
    undefined,
    undefined,
    atlas,
  );

  app.onError((error, c) => {
    if (error instanceof PersistenceError) {
      return c.json({ error: "storage_unavailable" }, 503);
    }
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/health", (c) => {
    const body: HealthResponse = {
      status: "ok",
      service: SERVICE_NAME,
      version: config.version,
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1_000),
    };
    return c.json(body);
  });

  if (backend?.a2a) {
    app.route("/", createA2ARoutes(backend.a2a));
  }

  app.route("/api/workspaces", createWorkspaceRoutes(workspaceService, {
    onDeleted: async (workspaceId) => { await atlas.eraseWorkspace(workspaceId); },
  }));
  app.route("/api", createJourneyRoutes({
    workspaces: workspaceService,
    journey,
    history,
  }));
  app.route("/api/atlas", createAtlasRoutes({ workspaces: workspaceService, atlas }));

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
