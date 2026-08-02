import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import type { HistoryService } from "../../history/index.js";
import { isHistoryExperienceSource } from "../../history/index.js";
import {
  INSTRUMENT_DICTIONARY_AS_OF,
  INSTRUMENT_QUERY_MAX_LENGTH,
  isInstrumentAssetClass,
  searchInstruments,
} from "../../instruments/index.js";
import type { WorkspaceService } from "../../workspace/index.js";
import { WORKSPACE_COOKIE } from "../../workspace/index.js";
import { JourneyAnalysisService, JourneyInputError } from "./service.js";
import type { RandomExampleValuationService } from "./random-example-valuation.js";
import { DEFAULT_THEME_ID, isThemeId } from "../../theme/index.js";

const UNAUTHORIZED = { error: "unauthorized" } as const;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,160}$/;

async function workspaceId(
  c: Context,
  workspaces: WorkspaceService,
  cookieName: string,
): Promise<string | null> {
  const access = await workspaces.authorize(getCookie(c, cookieName));
  return access.ok ? access.workspace.workspace_id : null;
}

function validIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}

function evidencePageParameters(c: Context): { cursor: number; limit: number } | null {
  const rawCursor = c.req.query("cursor");
  const rawLimit = c.req.query("limit");
  if (rawCursor !== undefined && !/^\d+$/.test(rawCursor)) return null;
  if (rawLimit !== undefined && !/^\d+$/.test(rawLimit)) return null;
  const cursor = rawCursor === undefined ? 0 : Number(rawCursor);
  const limit = rawLimit === undefined ? 20 : Number(rawLimit);
  if (!Number.isSafeInteger(cursor) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) return null;
  return { cursor, limit };
}

function analysisSummary(analysis: { evidence: readonly unknown[] }) {
  const { evidence, ...summary } = analysis;
  return { ...summary, evidence_total: evidence.length };
}

function snapshotSummary(snapshot: { lines: readonly unknown[] }) {
  const { lines, ...summary } = snapshot;
  return { ...summary, lines_total: lines.length };
}

function historySummary<T>(value: T): T {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  let summary: Record<string, unknown> = record;
  if (record.analysis && typeof record.analysis === "object" && !Array.isArray(record.analysis)) {
    const analysis = record.analysis as Record<string, unknown>;
    if (Array.isArray(analysis.evidence)) summary = { ...summary, analysis: analysisSummary(analysis as { evidence: readonly unknown[] }) };
  }
  if (record.snapshot && typeof record.snapshot === "object" && !Array.isArray(record.snapshot)) {
    const snapshot = record.snapshot as Record<string, unknown>;
    if (Array.isArray(snapshot.lines)) summary = { ...summary, snapshot: snapshotSummary(snapshot as { lines: readonly unknown[] }) };
  }
  if (record.record && typeof record.record === "object" && !Array.isArray(record.record)) {
    return { ...summary, record: historySummary(record.record) } as T;
  }
  return summary as T;
}

export function createJourneyRoutes(input: {
  workspaces: WorkspaceService;
  journey: JourneyAnalysisService;
  history: HistoryService;
  randomExamples?: Pick<RandomExampleValuationService, "create">;
  onReviewStarted?: () => Promise<void>;
  cookieName?: string;
}): Hono {
  const app = new Hono();
  const cookieName = input.cookieName ?? WORKSPACE_COOKIE;
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/current-draft", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
    if (!id) return c.json(UNAUTHORIZED, 401);
    return c.json({ draft: await input.journey.getDraft(id) });
  });

  app.put("/current-draft", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
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
    const id = await workspaceId(c, input.workspaces, cookieName);
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

  // Server-side only: this path may call a public market provider. The browser
  // receives the provider/fallback provenance alongside the generated line.
  app.post("/random-examples/holding", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
    if (!id) return c.json(UNAUTHORIZED, 401);
    if (!input.randomExamples) return c.json({ error: "random_example_unavailable" }, 503);
    const draft = await input.journey.getDraft(id);
    const excludedSymbols = new Set(
      draft?.lines
        .map((line) => line.symbol)
        .filter((symbol): symbol is string => symbol !== "unknown" && symbol !== "not_decided") ?? [],
    );
    const example = await input.randomExamples.create({ excludedSymbols });
    return example
      ? c.json({ example })
      : c.json({ error: "no_random_candidate" }, 409);
  });

  app.post("/analyses", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
    if (!id) return c.json(UNAUTHORIZED, 401);
    let body: { experience_source?: unknown; theme_id?: unknown };
    try {
      body = await c.req.json() as { experience_source?: unknown; theme_id?: unknown };
    } catch {
      return c.json({ error: "invalid_experience_source" }, 400);
    }
    if (!isHistoryExperienceSource(body.experience_source)) {
      return c.json({ error: "invalid_experience_source" }, 400);
    }
    const themeId = body.theme_id ?? DEFAULT_THEME_ID;
    if (!isThemeId(themeId)) return c.json({ error: "invalid_theme" }, 400);
    try {
      const result = await input.journey.start(id, body.experience_source, themeId);
      if (result.created) await input.onReviewStarted?.();
      return c.json({
        analysis_id: result.run.analysis_id,
        experience_source: result.run.experience_source,
        state: result.run.state,
        reused_active: !result.created,
        theme_id: result.run.snapshot.theme_id,
      }, 202);
    } catch (error) {
      if (error instanceof JourneyInputError) return c.json({ error: error.code }, 400);
      throw error;
    }
  });

  app.get("/analyses/:analysisId", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
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
      theme_id: run.snapshot.theme_id,
      ...(run.state === "terminal" ? {
        terminal_reason: run.terminal_reason,
        retryable: run.retryable,
        result_status: run.execution?.analysis.status ?? "unavailable",
      } : {}),
    } });
  });

  app.get("/analyses/:analysisId/events", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const analysisId = c.req.param("analysisId");
    if (!validIdentifier(analysisId)) return c.json({ error: "not_found" }, 404);
    const events = await input.journey.getEvents(id, analysisId);
    return events ? c.json({ analysis_id: analysisId, events }) : c.json({ error: "not_found" }, 404);
  });

  app.get("/analyses/:analysisId/holdings", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const analysisId = c.req.param("analysisId");
    if (!validIdentifier(analysisId)) return c.json({ error: "not_found" }, 404);
    const page = evidencePageParameters(c);
    if (!page) return c.json({ error: "invalid_pagination" }, 400);
    const run = await input.journey.getRun(id, analysisId);
    if (!run) return c.json({ error: "not_found" }, 404);
    const lines = run.snapshot.lines;
    const nextOffset = page.cursor + page.limit;
    return c.json({
      analysis_id: analysisId,
      holdings: lines.slice(page.cursor, nextOffset),
      next_cursor: nextOffset < lines.length ? String(nextOffset) : null,
      total: lines.length,
    });
  });

  app.get("/analyses/:analysisId/evidence", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const analysisId = c.req.param("analysisId");
    if (!validIdentifier(analysisId)) return c.json({ error: "not_found" }, 404);
    const page = evidencePageParameters(c);
    if (!page) return c.json({ error: "invalid_pagination" }, 400);
    const run = await input.journey.getRun(id, analysisId);
    if (!run) return c.json({ error: "not_found" }, 404);
    if (!run.execution || run.state !== "terminal") return c.json({ error: "not_ready" }, 409);
    const evidence = run.execution.analysis.evidence;
    const nextOffset = page.cursor + page.limit;
    return c.json({
      analysis_id: analysisId,
      evidence: evidence.slice(page.cursor, nextOffset),
      next_cursor: nextOffset < evidence.length ? String(nextOffset) : null,
      total: evidence.length,
    });
  });

  app.get("/analyses/:analysisId/result", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
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
      analysis: analysisSummary(run.execution.analysis),
      snapshot: snapshotSummary(run.snapshot),
      experience_source: run.experience_source ?? null,
      narrative: run.execution.narrative ?? null,
      ai_text: run.execution.ai_text ?? null,
      ai_theme_text: run.execution.ai_theme_text ?? null,
    });
  });

  // Relaxed Demo mode: incremental free-text model output over SSE.
  // Same-origin requests carry the workspace cookie automatically; the full
  // text is also recoverable in one shot from the result endpoint above.
  app.get("/analyses/:analysisId/stream", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const analysisId = c.req.param("analysisId");
    if (!validIdentifier(analysisId)) return c.json({ error: "not_found" }, 404);
    const run = await input.journey.getRun(id, analysisId);
    if (!run) return c.json({ error: "not_found" }, 404);
    return streamSSE(c, async (stream) => {
      if (run.state === "terminal") {
        await stream.writeSSE({ event: "done", data: "{}" });
        return;
      }
      await new Promise<void>((resolve) => {
        let chain = Promise.resolve();
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          resolve();
        };
        const unsubscribe = input.journey.subscribeStream(analysisId, (event) => {
          chain = chain
            .then(() =>
              event.type === "delta"
                ? stream.writeSSE({ event: "delta", data: JSON.stringify({ text: event.text }) })
                : stream.writeSSE({ event: "done", data: "{}" }),
            )
            .catch(() => undefined);
          if (event.type === "done") void chain.then(finish);
        });
        stream.onAbort(() => {
          unsubscribe();
          finish();
        });
      });
    });
  });

  app.get("/history", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
    if (!id) return c.json(UNAUTHORIZED, 401);
    return c.json({ history: (await input.history.list(id)).map((record) => historySummary(record)) });
  });

  app.get("/history/:recordId", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const recordId = c.req.param("recordId");
    if (!validIdentifier(recordId)) return c.json({ error: "not_found" }, 404);
    const result = await input.history.getDetail(id, recordId);
    return result.status === "not_found"
      ? c.json({ error: "not_found" }, 404)
      : c.json({ history: historySummary(result) });
  });

  app.get("/history/:recordId/replay", async (c) => {
    const id = await workspaceId(c, input.workspaces, cookieName);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const recordId = c.req.param("recordId");
    if (!validIdentifier(recordId)) return c.json({ error: "not_found" }, 404);
    const result = await input.history.replay(id, recordId);
    return result.status === "not_found"
      ? c.json({ error: "not_found" }, 404)
      : c.json({ history: historySummary(result) });
  });

  return app;
}
