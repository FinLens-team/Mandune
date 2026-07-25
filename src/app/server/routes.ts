import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import type { HistoryService } from "../../history/index.js";
import {
  INSTRUMENT_DICTIONARY_AS_OF,
  INSTRUMENT_QUERY_MAX_LENGTH,
  isInstrumentAssetClass,
  searchInstruments,
} from "../../instruments/index.js";
import type { WorkspaceService } from "../../workspace/index.js";
import { WORKSPACE_COOKIE } from "../../workspace/index.js";
import { JourneyAnalysisService, JourneyInputError } from "./service.js";

const UNAUTHORIZED = { error: "unauthorized" } as const;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,160}$/;

async function workspaceId(c: Context, workspaces: WorkspaceService): Promise<string | null> {
  const access = await workspaces.authorize(getCookie(c, WORKSPACE_COOKIE));
  return access.ok ? access.workspace.workspace_id : null;
}

function validIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}

export function createJourneyRoutes(input: {
  workspaces: WorkspaceService;
  journey: JourneyAnalysisService;
  history: HistoryService;
}): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/current-draft", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    return c.json({ draft: await input.journey.getDraft(id) });
  });

  app.put("/current-draft", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const contentLength = Number(c.req.header("content-length") ?? "0");
    if (contentLength > 1_000_000) return c.json({ error: "invalid_draft" }, 400);
    let body: { draft?: unknown };
    try {
      body = await c.req.json() as { draft?: unknown };
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    try {
      return c.json({ draft: await input.journey.putDraft(id, body.draft) });
    } catch (error) {
      if (error instanceof JourneyInputError) return c.json({ error: error.code }, 400);
      throw error;
    }
  });

  // Assistive fill-in search over the static reference dictionary.
  // Query keywords never leave this server; no provider call is made.
  app.get("/instruments/search", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const query = c.req.query("q") ?? "";
    if (query.length > INSTRUMENT_QUERY_MAX_LENGTH) {
      return c.json({ error: "invalid_query" }, 400);
    }
    const assetClass = c.req.query("asset_class");
    if (assetClass !== undefined && !isInstrumentAssetClass(assetClass)) {
      return c.json({ error: "invalid_asset_class" }, 400);
    }
    return c.json({
      suggestions: searchInstruments(query, assetClass ? { assetClass } : {}),
      dictionary_as_of: INSTRUMENT_DICTIONARY_AS_OF,
    });
  });

  app.post("/analyses", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    try {
      const result = await input.journey.start(id);
      return c.json({
        analysis_id: result.run.analysis_id,
        state: result.run.state,
        reused_active: !result.created,
      }, 202);
    } catch (error) {
      if (error instanceof JourneyInputError) return c.json({ error: error.code }, 400);
      throw error;
    }
  });

  app.get("/analyses/:analysisId", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const analysisId = c.req.param("analysisId");
    if (!validIdentifier(analysisId)) return c.json({ error: "not_found" }, 404);
    const run = await input.journey.getRun(id, analysisId);
    if (!run) return c.json({ error: "not_found" }, 404);
    return c.json({ analysis: {
      analysis_id: run.analysis_id,
      state: run.state,
      created_at: run.created_at,
      updated_at: run.updated_at,
      ...(run.state === "terminal" ? {
        terminal_reason: run.terminal_reason,
        retryable: run.retryable,
        result_status: run.execution?.analysis.status ?? "unavailable",
      } : {}),
    } });
  });

  app.get("/analyses/:analysisId/events", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const analysisId = c.req.param("analysisId");
    if (!validIdentifier(analysisId)) return c.json({ error: "not_found" }, 404);
    const events = await input.journey.getEvents(id, analysisId);
    return events ? c.json({ analysis_id: analysisId, events }) : c.json({ error: "not_found" }, 404);
  });

  app.get("/analyses/:analysisId/result", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const analysisId = c.req.param("analysisId");
    if (!validIdentifier(analysisId)) return c.json({ error: "not_found" }, 404);
    const run = await input.journey.getRun(id, analysisId);
    if (!run) return c.json({ error: "not_found" }, 404);
    if (run.state !== "terminal") return c.json({ status: "pending", analysis_id: analysisId }, 202);
    if (!run.execution) {
      return c.json({
        status: "unavailable",
        analysis_id: analysisId,
        reason: run.terminal_reason ?? "execution_failed",
        retryable: run.retryable,
      });
    }
    return c.json({
      status: "ready",
      analysis_id: analysisId,
      source: run.execution.source,
      analysis: run.execution.analysis,
      narrative: run.execution.narrative ?? null,
    });
  });

  app.get("/history", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    return c.json({ history: await input.history.list(id) });
  });

  app.get("/history/:recordId", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const recordId = c.req.param("recordId");
    if (!validIdentifier(recordId)) return c.json({ error: "not_found" }, 404);
    const result = await input.history.getDetail(id, recordId);
    return result.status === "not_found"
      ? c.json({ error: "not_found" }, 404)
      : c.json({ history: result });
  });

  app.get("/history/:recordId/replay", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const recordId = c.req.param("recordId");
    if (!validIdentifier(recordId)) return c.json({ error: "not_found" }, 404);
    const result = await input.history.replay(id, recordId);
    return result.status === "not_found"
      ? c.json({ error: "not_found" }, 404)
      : c.json({ history: result });
  });

  return app;
}
