import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FixtureAnalysisExecutor,
  FIXTURE_NON_LIVE_LABEL,
  JourneyAnalysisService,
  MemoryJourneyStore,
  type AnalysisExecutor,
  type StoredAnalysisRun,
} from "../../src/app/server/index.js";
import {
  CONTRACTS_VERSION,
  validateTaskEvent,
  type PortfolioDraft,
  type PortfolioSnapshot,
} from "../../src/contracts/index.js";
import { getFixture, type FixtureScenarioId } from "../../src/fixtures/index.js";
import { HistoryService } from "../../src/history/index.js";
import {
  SqliteHistoryStore,
  SqliteJourneyStore,
  SqliteWorkspaceStore,
  openSqliteDatabase,
  type SqliteDatabase,
} from "../../src/persistence/index.js";
import { createApp } from "../../src/server/app.js";
import { WORKSPACE_COOKIE, WorkspaceService } from "../../src/workspace/index.js";

const migrationsDirectory = path.resolve("migrations");
const roots: string[] = [];
const databases: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryDatabase(): string {
  const root = mkdtempSync(path.join(tmpdir(), "mandong-journey-"));
  roots.push(root);
  return path.join(root, "mandong.sqlite3");
}

function open(dbPath = temporaryDatabase()): SqliteDatabase {
  const database = openSqliteDatabase({ dbPath, migrationsDirectory, busyTimeoutMs: 100 });
  databases.push(database);
  return database;
}

function close(database: SqliteDatabase): void {
  database.close();
  const index = databases.indexOf(database);
  if (index >= 0) databases.splice(index, 1);
}

function draftFor(scenarioId: FixtureScenarioId, mutate?: (draft: PortfolioDraft) => void): PortfolioDraft {
  const fixture = getFixture(scenarioId);
  const draft: PortfolioDraft = {
    draft_id: `draft-${scenarioId}`,
    created_at: "2026-07-25T02:00:00.000Z",
    updated_at: "2026-07-25T02:00:00.000Z",
    source_label: "随机体验身份 · 示例数据",
    lines: fixture.snapshot.lines.map((line) => ({
      line_id: line.line_id,
      asset_class: line.asset_class,
      name: line.name,
      symbol: line.symbol,
      ...(line.market ? { market: line.market } : {}),
      size_basis: line.size_basis,
      observation_date: line.observation_date,
      entry_method: "example",
      is_usable: true,
      unresolved_fields: [],
      notes: "示例数据，非真实持仓",
    })),
    constraints: structuredClone(fixture.snapshot.constraints),
  };
  mutate?.(draft);
  return draft;
}

function snapshotFor(scenarioId: FixtureScenarioId): PortfolioSnapshot {
  const fixture = getFixture(scenarioId);
  return {
    snapshot_id: `snapshot-${scenarioId}`,
    created_at: "2026-07-25T02:00:00.000Z",
    contracts_version: CONTRACTS_VERSION,
    theme_id: fixture.snapshot.theme_id,
    lines: structuredClone(fixture.snapshot.lines),
    constraints: structuredClone(fixture.snapshot.constraints),
  };
}

function composition(database = open(), executor?: AnalysisExecutor) {
  const workspaces = new WorkspaceService(new SqliteWorkspaceStore(database));
  const history = new HistoryService(new SqliteHistoryStore(database));
  const store = new SqliteJourneyStore(database);
  const journey = new JourneyAnalysisService(store, history, executor);
  const app = createApp({ version: "journey-test" }, workspaces, { history, journey });
  return { app, workspaces, history, store, journey, database };
}

async function createCookie(app: ReturnType<typeof createApp>): Promise<string> {
  const response = await app.request("http://localhost/api/workspaces", { method: "POST" });
  expect(response.status).toBe(201);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";", 1)[0] ?? "";
  expect(cookie).toContain(`${WORKSPACE_COOKIE}=`);
  return cookie;
}

async function request(
  app: ReturnType<typeof createApp>,
  cookie: string,
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  return await app.request(`http://localhost${pathname}`, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...init.headers },
  });
}

describe("#34 backend journey transport", () => {
  it("authorizes durable current drafts by cookie and isolates two workspaces", async () => {
    const { app } = composition();
    const cookieA = await createCookie(app);
    const cookieB = await createCookie(app);
    const draft = draftFor("supported_full", (value) => {
      value.constraints.near_term_liquidity = "暂无明确近期需求";
    });

    const saved = await request(app, cookieA, "/api/current-draft", {
      method: "PUT",
      body: JSON.stringify({ draft }),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ draft });

    const own = await request(app, cookieA, "/api/current-draft");
    expect(await own.json()).toEqual({ draft });
    const isolated = await request(app, cookieB, "/api/current-draft");
    expect(await isolated.json()).toEqual({ draft: null });
    const forged = await request(app, `${WORKSPACE_COOKIE}=forged-locator-value`, "/api/current-draft");
    expect(forged.status).toBe(401);
    expect(saved.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a stable id, durable task events/result, and immutable history", async () => {
    const { app, journey } = composition();
    const cookie = await createCookie(app);
    const draft = draftFor("supported_full", (value) => {
      value.constraints.near_term_liquidity = "暂无明确近期需求";
    });
    await request(app, cookie, "/api/current-draft", {
      method: "PUT",
      body: JSON.stringify({ draft }),
    });

    const started = await request(app, cookie, "/api/analyses", {
      method: "POST",
      body: JSON.stringify({ experience_source: "edited" }),
    });
    expect(started.status).toBe(202);
    const startBody = await started.json() as { analysis_id: string };
    expect(startBody.analysis_id).toMatch(/^analysis_[A-Za-z0-9-]+$/);
    await journey.waitForIdle();

    const status = await request(app, cookie, `/api/analyses/${startBody.analysis_id}`);
    expect(await status.json()).toMatchObject({
      analysis: { analysis_id: startBody.analysis_id, state: "terminal", result_status: "supported" },
    });
    const eventResponse = await request(app, cookie, `/api/analyses/${startBody.analysis_id}/events`);
    const eventBody = await eventResponse.json() as { events: unknown[] };
    expect(eventBody.events.length).toBeGreaterThan(8);
    expect(eventBody.events.every((event) => validateTaskEvent(event).ok)).toBe(true);
    const serializedEvents = JSON.stringify(eventBody.events);
    expect(serializedEvents).not.toContain("510300.SH");
    expect(serializedEvents).not.toContain("示例持仓规模");
    expect(serializedEvents).not.toContain(WORKSPACE_COOKIE);

    const result = await request(app, cookie, `/api/analyses/${startBody.analysis_id}/result`);
    const resultBody = await result.json() as {
      source: { label: string; is_live: boolean };
      analysis: { analysis_id: string; evidence_cutoff_at: string; evidence: Array<{ fetched_at: string }> };
    };
    expect(resultBody.source).toEqual(expect.objectContaining({
      label: FIXTURE_NON_LIVE_LABEL,
      is_live: false,
    }));
    expect(resultBody.analysis.analysis_id).toBe(startBody.analysis_id);
    expect(resultBody.analysis.evidence_cutoff_at).toBe(getFixture("supported_full").analysis.evidence_cutoff_at);
    expect(resultBody.analysis.evidence.map((item) => item.fetched_at)).toEqual(
      getFixture("supported_full").analysis.evidence.map((item) => item.fetched_at),
    );

    const history = await request(app, cookie, "/api/history");
    const historyBody = await history.json() as { history: Array<{ record_id: string }> };
    expect(historyBody.history).toHaveLength(1);
    expect(historyBody.history[0]?.record_id).toBe(startBody.analysis_id);
    const detail = await request(app, cookie, `/api/history/${startBody.analysis_id}`);
    expect(await detail.json()).toMatchObject({
      history: {
        status: "found",
        record: {
          analysis: { analysis_id: startBody.analysis_id },
          experience_source: "edited",
        },
      },
    });
    const replay = await request(app, cookie, `/api/history/${startBody.analysis_id}/replay`);
    expect(await replay.json()).toMatchObject({
      history: {
        status: "replayed",
        source: "immutable_history",
        record: { analysis: { analysis_id: startBody.analysis_id } },
      },
    });
  });

  it.each([
    undefined,
    "unknown",
    42,
  ])("rejects %s experience source before creating a run", async (experienceSource) => {
    const { app } = composition();
    const cookie = await createCookie(app);
    await request(app, cookie, "/api/current-draft", {
      method: "PUT",
      body: JSON.stringify({ draft: draftFor("supported_full") }),
    });

    const response = await request(app, cookie, "/api/analyses", {
      method: "POST",
      body: JSON.stringify(
        experienceSource === undefined ? {} : { experience_source: experienceSource },
      ),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_experience_source" });
  });

  it("keeps unmatched random holdings as an observation-only result", async () => {
    const { app, journey } = composition();
    const cookie = await createCookie(app);
    const draft = draftFor("supported_full", (value) => {
      const first = value.lines[0];
      if (first) first.symbol = "510500.SH";
    });
    await request(app, cookie, "/api/current-draft", {
      method: "PUT",
      body: JSON.stringify({ draft }),
    });
    const response = await request(app, cookie, "/api/analyses", {
      method: "POST",
      body: JSON.stringify({ experience_source: "random" }),
    });
    const { analysis_id } = await response.json() as { analysis_id: string };
    await journey.waitForIdle();
    const result = await request(app, cookie, `/api/analyses/${analysis_id}/result`);
    expect(await result.json()).toMatchObject({
      status: "ready",
      source: { kind: "fixture", is_live: false },
      analysis: {
        status: "observation_only",
        evidence: expect.arrayContaining([expect.objectContaining({ status: "unverified" })]),
        conclusions: expect.arrayContaining([expect.objectContaining({ id: "observation-only-boundary" })]),
        advice: expect.arrayContaining([expect.objectContaining({ id: "observation-only-wait-for-data" })]),
      },
    });
  });

  it("turns persisted nonterminal runs into explicit retryable unavailable after restart", async () => {
    const dbPath = temporaryDatabase();
    const first = open(dbPath);
    const workspaces = new WorkspaceService(new SqliteWorkspaceStore(first));
    const created = await workspaces.create();
    const store = new SqliteJourneyStore(first);
    const run: StoredAnalysisRun = {
      workspace_id: created.record.workspace_id,
      analysis_id: "analysis_restart_recovery",
      snapshot: snapshotFor("supported_full"),
      state: "running",
      created_at: "2026-07-25T02:00:00.000Z",
      updated_at: "2026-07-25T02:00:01.000Z",
      retryable: false,
    };
    expect((await store.createRun(run)).created).toBe(true);
    close(first);

    const second = open(dbPath);
    const restarted = new SqliteJourneyStore(second);
    expect(restarted.recoverInterruptedRunsNow("2026-07-25T02:01:00.000Z")).toBe(1);
    expect(await restarted.getRun(created.record.workspace_id, run.analysis_id)).toMatchObject({
      state: "terminal",
      terminal_reason: "restart_interrupted",
      retryable: true,
    });
    const events = await restarted.listEvents(created.record.workspace_id, run.analysis_id);
    expect(events).toEqual([expect.objectContaining({
      analysis_id: run.analysis_id,
      stage: "persist_or_return",
      state: "failed",
    })]);
  });

  it("starts a new theme after an older themed run was interrupted", async () => {
    const store = new MemoryJourneyStore();
    const history = new HistoryService();
    let id = 0;
    const service = new JourneyAnalysisService(
      store,
      history,
      new FixtureAnalysisExecutor("supported_full"),
      () => new Date("2026-07-25T03:00:00.000Z"),
      () => `analysis-theme-${++id}`,
    );
    await service.putDraft("workspace-theme-retry", draftFor("supported_full"));
    const oldSnapshot = { ...snapshotFor("supported_full"), theme_id: "sunge" };
    await store.createRun({
      workspace_id: "workspace-theme-retry",
      analysis_id: "analysis-old-sunge",
      snapshot: oldSnapshot,
      state: "running",
      created_at: "2026-07-25T02:00:00.000Z",
      updated_at: "2026-07-25T02:00:01.000Z",
      retryable: false,
    });
    await store.recoverInterruptedRuns("2026-07-25T02:01:00.000Z");

    const started = await service.start("workspace-theme-retry", "random", "eastern_observation");

    expect(started).toMatchObject({
      created: true,
      run: {
        analysis_id: "analysis-theme-1",
        snapshot: { theme_id: "eastern_observation" },
      },
    });
    expect(await store.getRun("workspace-theme-retry", "analysis-old-sunge")).toMatchObject({
      state: "terminal",
      terminal_reason: "restart_interrupted",
      snapshot: { theme_id: "sunge" },
    });
    await service.waitForIdle();
  });

  it("cascades drafts/runs and fences a completion that arrives after deletion", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fixture = new FixtureAnalysisExecutor();
    const delayed: AnalysisExecutor = {
      async execute(input) {
        await gate;
        return fixture.execute(input);
      },
    };
    const { app, workspaces, journey, store } = composition(undefined, delayed);
    const cookie = await createCookie(app);
    const locator = cookie.slice(cookie.indexOf("=") + 1);
    const access = await workspaces.authorize(locator);
    if (!access.ok) throw new Error("workspace authorization failed");
    await request(app, cookie, "/api/current-draft", {
      method: "PUT",
      body: JSON.stringify({ draft: draftFor("supported_full") }),
    });
    const started = await request(app, cookie, "/api/analyses", {
      method: "POST",
      body: JSON.stringify({ experience_source: "random" }),
    });
    const { analysis_id } = await started.json() as { analysis_id: string };
    const duplicate = await request(app, cookie, "/api/analyses", {
      method: "POST",
      body: JSON.stringify({ experience_source: "edited" }),
    });
    expect(await duplicate.json()).toMatchObject({
      analysis_id,
      experience_source: "random",
      reused_active: true,
    });
    expect((await workspaces.delete(locator)).ok).toBe(true);
    release();
    await journey.waitForIdle();
    expect(await store.getDraft(access.workspace.workspace_id)).toBeNull();
    expect(await store.getRun(access.workspace.workspace_id, analysis_id)).toBeNull();
    expect(await workspaces.authorize(locator)).toEqual({ ok: false, code: "unauthorized" });

    const expiring = await workspaces.create();
    await store.putDraft(expiring.record.workspace_id, draftFor("supported_full"));
    await store.createRun({
      workspace_id: expiring.record.workspace_id,
      analysis_id: "analysis-ttl-cascade",
      snapshot: snapshotFor("supported_full"),
      state: "queued",
      created_at: "2026-07-25T02:00:00.000Z",
      updated_at: "2026-07-25T02:00:00.000Z",
      retryable: false,
    });
    await workspaces.getStoreForTests().put({
      ...expiring.record,
      expires_at: "2000-01-01T00:00:00.000Z",
    });
    expect(await workspaces.purgeExpired()).toMatchObject({
      purged: [expiring.record.workspace_id],
      failed: [],
    });
    expect(await store.getDraft(expiring.record.workspace_id)).toBeNull();
    expect(await store.getRun(expiring.record.workspace_id, "analysis-ttl-cascade")).toBeNull();
  });
});

describe("fixture execution status boundaries", () => {
  it.each([
    ["supported_full", "supported", true],
    ["limited_partial", "limited", true],
    ["observation_only_gaps", "observation_only", true],
    ["unavailable_no_evidence", "unavailable", false],
  ] as const)("keeps %s as %s without inventing narrative", async (scenarioId, status, hasNarrative) => {
    const store = new MemoryJourneyStore();
    const history = new HistoryService();
    const service = new JourneyAnalysisService(
      store,
      history,
      new FixtureAnalysisExecutor(scenarioId),
      () => new Date("2026-07-25T03:00:00.000Z"),
      () => `analysis-${scenarioId}`,
    );
    const draft = draftFor(scenarioId);
    if (scenarioId === "supported_full") {
      draft.constraints.near_term_liquidity = "暂无明确近期需求";
    }
    await service.putDraft("workspace-status-test", draft);

    // Memory history intentionally has no workspace FK; this isolates execution/result semantics.
    const started = await service.start("workspace-status-test", "random");
    await service.waitForIdle();
    const run = await service.getRun("workspace-status-test", started.run.analysis_id);
    expect(run?.execution?.analysis.status).toBe(status);
    expect(Boolean(run?.execution?.narrative)).toBe(hasNarrative);
    expect(run?.execution?.source).toMatchObject({ kind: "fixture", is_live: false });
  });

  it("recomputes fixture status and limitations from the current unknown constraints", async () => {
    const store = new MemoryJourneyStore();
    const history = new HistoryService();
    const service = new JourneyAnalysisService(
      store,
      history,
      new FixtureAnalysisExecutor("supported_full"),
      () => new Date("2026-07-25T03:00:00.000Z"),
      () => "analysis-unknown-constraint",
    );
    const draft = draftFor("supported_full");
    draft.constraints.near_term_liquidity = "unknown";
    await service.putDraft("workspace-unknown-constraint", draft);

    const started = await service.start("workspace-unknown-constraint", "random");
    await service.waitForIdle();
    const run = await service.getRun("workspace-unknown-constraint", started.run.analysis_id);

    expect(run?.execution?.analysis.status).toBe("limited");
    expect(run?.execution?.analysis.unknowns).toContainEqual(expect.objectContaining({
      subject: "near_term_liquidity",
    }));
    expect(run?.execution?.analysis.conclusions.every((item) =>
      item.affected_by_unknowns && (item.limited_by?.length ?? 0) > 0)).toBe(true);
  });
});
