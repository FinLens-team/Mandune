import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisCommitFence } from "../../src/analysis/index.js";
import type { StoredHistoryEnvelope } from "../../src/history/index.js";
import {
  PersistenceError,
  SQLITE_SCHEMA_VERSION,
  SqliteHistoryStore,
  SqliteWorkspaceStore,
  openSqliteDatabase,
  type SqliteDatabase,
} from "../../src/persistence/index.js";
import { runMaintenance } from "../../src/persistence/maintenance.js";
import { createApp } from "../../src/server/app.js";
import { loadServerConfig } from "../../src/server/config.js";
import { startServer } from "../../src/server/index.js";
import {
  FakeClock,
  WORKSPACE_COOKIE,
  WORKSPACE_TTL_MS,
  WorkspaceService,
} from "../../src/workspace/index.js";

const migrationsDirectory = path.resolve("migrations");
const roots: string[] = [];
const databases: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "mandong-persistence-"));
  roots.push(root);
  return root;
}

function databasePath(root = temporaryRoot()): string {
  return path.join(root, "mandong.sqlite3");
}

function open(dbPath: string, busyTimeoutMs = 100): SqliteDatabase {
  const database = openSqliteDatabase({ dbPath, migrationsDirectory, busyTimeoutMs });
  databases.push(database);
  return database;
}

function close(database: SqliteDatabase): void {
  database.close();
  const index = databases.indexOf(database);
  if (index >= 0) databases.splice(index, 1);
}

function fence(): AnalysisCommitFence {
  const controller = new AbortController();
  return { signal: controller.signal, canCommit: () => true };
}

async function availablePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Failed to reserve test port.");
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function envelope(workspaceId: string, suffix: string): StoredHistoryEnvelope {
  return {
    workspace_id: workspaceId,
    record_id: `analysis-${suffix}`,
    analysis_id: `analysis-${suffix}`,
    snapshot_id: `snapshot-${suffix}`,
    analysis_completed_at: "2026-07-25T01:00:30.000Z",
    evidence_cutoff_at: "2026-07-24T23:59:59.000Z",
    result_status: "supported",
    theme_id: "eastern_observation",
    versions: {
      history_schema: "analysis-history.v1",
      contracts: "1.0.0",
      rational_analysis: "rational-analysis.v1",
      theme_narrative: "theme-narrative.v1",
    },
    payload_json: JSON.stringify({ fixture: suffix }),
  };
}

describe("SQLite durable stores", () => {
  it("preserves workspace and immutable history across connection restarts", async () => {
    const dbPath = databasePath();
    const first = open(dbPath);
    const firstWorkspaces = new WorkspaceService(new SqliteWorkspaceStore(first));
    const created = await firstWorkspaces.create();
    const firstHistory = new SqliteHistoryStore(first);
    expect(await firstHistory.append(envelope(created.record.workspace_id, "restart"), fence())).toBe("committed");
    close(first);

    const second = open(dbPath);
    const secondWorkspaces = new WorkspaceService(new SqliteWorkspaceStore(second));
    const access = await secondWorkspaces.authorize(created.record.locator);
    expect(access.ok && access.workspace.workspace_id).toBe(created.record.workspace_id);
    expect(await new SqliteHistoryStore(second).list(created.record.workspace_id)).toEqual([
      envelope(created.record.workspace_id, "restart"),
    ]);

    const raw = new DatabaseSync(dbPath, { readOnly: true });
    expect(raw.prepare("PRAGMA user_version").get()).toEqual({ user_version: SQLITE_SCHEMA_VERSION });
    expect(raw.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    expect(raw.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    raw.close();
  });

  it("isolates workspaces and serializes idempotent concurrent appends", async () => {
    const dbPath = databasePath();
    const first = open(dbPath);
    const second = open(dbPath);
    const service = new WorkspaceService(new SqliteWorkspaceStore(first));
    const workspaceA = await service.create();
    const workspaceB = await service.create();
    const record = envelope(workspaceA.record.workspace_id, "unique");

    const results = await Promise.all([
      new SqliteHistoryStore(first).append(record, fence()),
      new SqliteHistoryStore(second).append(structuredClone(record), fence()),
    ]);
    expect(results.sort()).toEqual(["committed", "idempotent"]);
    expect(await new SqliteHistoryStore(first).list(workspaceA.record.workspace_id)).toHaveLength(1);
    expect(await new SqliteHistoryStore(first).list(workspaceB.record.workspace_id)).toEqual([]);

    const conflict = structuredClone(record);
    conflict.payload_json = JSON.stringify({ changed: true });
    expect(await new SqliteHistoryStore(second).append(conflict, fence())).toBe("conflict");
    const duplicateAnalysis = envelope(workspaceA.record.workspace_id, "other-record");
    duplicateAnalysis.analysis_id = record.analysis_id;
    expect(await new SqliteHistoryStore(second).append(duplicateAnalysis, fence())).toBe("conflict");
    expect((await new SqliteHistoryStore(first).get(workspaceA.record.workspace_id, record.record_id))?.payload_json)
      .toBe(record.payload_json);
  });

  it("makes active deletion and TTL cleanup atomic with durable write tombstones", async () => {
    const dbPath = databasePath();
    const clock = new FakeClock(new Date("2026-06-01T00:00:00.000Z"));
    const database = open(dbPath);
    const store = new SqliteWorkspaceStore(database);
    const workspaces = new WorkspaceService(store, clock);
    const history = new SqliteHistoryStore(database);
    const active = await workspaces.create();
    const expiring = await workspaces.create();
    const activeRecord = envelope(active.record.workspace_id, "active-delete");
    const expiringRecord = envelope(expiring.record.workspace_id, "ttl-delete");
    await history.append(activeRecord, fence());
    await history.append(expiringRecord, fence());

    expect((await workspaces.delete(active.record.locator)).ok).toBe(true);
    expect(await history.list(active.record.workspace_id)).toEqual([]);
    expect(await history.append(activeRecord, fence())).toBe("workspace_erased");

    clock.advanceMs(WORKSPACE_TTL_MS + 1);
    expect(await workspaces.purgeExpired()).toMatchObject({
      purged: expect.arrayContaining([expiring.record.workspace_id]),
      failed: [],
    });
    expect(await history.list(expiring.record.workspace_id)).toEqual([]);
    expect(await history.append(expiringRecord, fence())).toBe("workspace_erased");
    close(database);

    const restarted = open(dbPath);
    expect(await new WorkspaceService(new SqliteWorkspaceStore(restarted)).authorize(active.record.locator))
      .toEqual({ ok: false, code: "unauthorized" });
    expect(await new SqliteHistoryStore(restarted).append(activeRecord, fence())).toBe("workspace_erased");
  });

  it("rolls back a failed append without a partial or orphaned record", async () => {
    const dbPath = databasePath();
    const database = open(dbPath);
    const workspaces = new WorkspaceService(new SqliteWorkspaceStore(database));
    const created = await workspaces.create();
    const history = new SqliteHistoryStore(database);
    const first = envelope(created.record.workspace_id, "one");
    await history.append(first, fence());
    const invalid = envelope(created.record.workspace_id, "invalid");
    invalid.result_status = null as never;

    await expect(history.append(invalid, fence())).rejects.toBeInstanceOf(PersistenceError);
    expect(await history.list(created.record.workspace_id)).toEqual([first]);
  });
});

describe("SQLite startup failure boundaries", () => {
  it("rejects unknown future schemas without changing user_version", () => {
    const dbPath = databasePath();
    const raw = new DatabaseSync(dbPath);
    raw.exec("PRAGMA user_version = 99");
    raw.close();

    expect(() => openSqliteDatabase({ dbPath, migrationsDirectory })).toThrowError(
      expect.objectContaining({ code: "unknown_schema" }),
    );
    const verify = new DatabaseSync(dbPath, { readOnly: true });
    expect(verify.prepare("PRAGMA user_version").get()).toEqual({ user_version: 99 });
    verify.close();
  });

  it("fails closed on corrupt bytes and never returns a usable database", () => {
    const dbPath = databasePath();
    const marker = "private-locator-corrupt-marker";
    writeFileSync(dbPath, marker);
    expect(() => openSqliteDatabase({ dbPath, migrationsDirectory })).toThrowError(
      expect.objectContaining({ code: "corrupt_database" }),
    );
    expect(readFileSync(dbPath, "utf8")).toContain(marker);
  });

  it("rolls back a failed migration and leaves schema version zero", () => {
    const root = temporaryRoot();
    const dbPath = databasePath(root);
    const brokenMigrations = path.join(root, "migrations");
    mkdirSync(brokenMigrations);
    writeFileSync(path.join(brokenMigrations, "001-initial.sql"), "CREATE TABLE partial(id TEXT); INVALID SQL;");

    expect(() => openSqliteDatabase({ dbPath, migrationsDirectory: brokenMigrations })).toThrowError(
      expect.objectContaining({ code: "migration_failed" }),
    );
    const raw = new DatabaseSync(dbPath);
    expect(raw.prepare("PRAGMA user_version").get()).toEqual({ user_version: 0 });
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'partial'").get()).toBeUndefined();
    raw.close();
  });

  it("maps write lock expiry to a privacy-safe lock_timeout", async () => {
    const dbPath = databasePath();
    const first = open(dbPath);
    const second = open(dbPath, 20);
    const service = new WorkspaceService(new SqliteWorkspaceStore(first));
    const created = await service.create();
    const locker = new DatabaseSync(dbPath);
    locker.exec("BEGIN IMMEDIATE");

    try {
      await expect(new SqliteWorkspaceStore(second).put({
        ...created.record,
        last_active_at: "2026-07-25T02:00:00.000Z",
      })).rejects.toMatchObject({ code: "lock_timeout", message: "Persistent storage is busy." });
    } finally {
      locker.exec("ROLLBACK");
      locker.close();
    }
  });

  it("fails before server composition can fall back when the database path is unavailable", () => {
    const root = temporaryRoot();
    const config = loadServerConfig({
      HOST: "127.0.0.1",
      PORT: "8787",
      APP_VERSION: "candidate-sha",
      MANDONG_DB_PATH: path.join(root, "missing", "mandong.sqlite3"),
      MANDONG_MIGRATIONS_DIR: migrationsDirectory,
    });
    expect(config).toMatchObject({ host: "127.0.0.1", port: 8787, version: "candidate-sha" });
    expect(() => startServer({
      HOST: config.host,
      PORT: String(config.port),
      APP_VERSION: config.version,
      MANDONG_DB_PATH: config.dbPath,
      MANDONG_MIGRATIONS_DIR: config.migrationsDirectory,
    })).toThrowError(expect.objectContaining({ code: "database_unavailable" }));
  });
});

describe("production privacy surface", () => {
  it("boots production wiring against SQLite and reports the configured candidate SHA", async () => {
    const dbPath = databasePath();
    const port = await availablePort();
    const { server } = startServer({
      HOST: "127.0.0.1",
      PORT: String(port),
      APP_VERSION: "candidate-sha-123",
      MANDONG_DB_PATH: dbPath,
      MANDONG_MIGRATIONS_DIR: migrationsDirectory,
    });
    try {
      if (!server.listening) {
        await new Promise<void>((resolve) => server.once("listening", resolve));
      }
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ version: "candidate-sha-123" });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("sets a Secure __Host locator cookie and exposes no public purge route", async () => {
    const app = createApp({ version: "candidate-sha" });
    const created = await app.request("http://localhost/api/workspaces", { method: "POST" });
    const cookie = created.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${WORKSPACE_COOKIE}=`);
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; Secure/i);
    expect(cookie).toMatch(/; SameSite=Lax/i);
    expect(cookie).toMatch(/; Path=\//i);
    expect(cookie).not.toMatch(/Domain=/i);

    const purge = await app.request("http://localhost/api/workspaces/maintenance/purge-expired", {
      method: "POST",
    });
    expect(purge.status).toBe(404);
  });

  it("runs purge only as a local command and prints counts without private identifiers", async () => {
    const dbPath = databasePath();
    const database = open(dbPath);
    const expiredLocator = "private-locator-must-not-be-printed";
    await new SqliteWorkspaceStore(database).put({
      workspace_id: "ws_private_identifier",
      locator: expiredLocator,
      created_at: "2026-01-01T00:00:00.000Z",
      last_active_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-31T00:00:00.000Z",
    });
    await new SqliteWorkspaceStore(database).put({
      workspace_id: "ws_active_analysis",
      locator: "active-analysis-locator",
      created_at: "2026-07-25T00:00:00.000Z",
      last_active_at: "2026-07-25T00:00:00.000Z",
      expires_at: "2099-07-25T00:00:00.000Z",
    });
    database.prepare(`
      INSERT INTO analysis_runs (
        workspace_id, analysis_id, snapshot_json, state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "ws_active_analysis",
      "analysis_active",
      "{}",
      "queued",
      "2026-07-25T00:01:00.000Z",
      "2026-07-25T00:01:00.000Z",
    );
    close(database);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runMaintenance("purge-expired", {
      MANDONG_DB_PATH: dbPath,
      MANDONG_MIGRATIONS_DIR: migrationsDirectory,
    }, {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    });
    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain("purged=1 failed=0");
    expect([...stdout, ...stderr].join("\n")).not.toMatch(/private|locator|ws_private_identifier/);

    const verify = open(dbPath);
    expect(verify.prepare(`
      SELECT state, terminal_reason, retryable FROM analysis_runs
      WHERE workspace_id = ? AND analysis_id = ?
    `).get("ws_active_analysis", "analysis_active")).toEqual({
      state: "queued",
      terminal_reason: null,
      retryable: 0,
    });
    expect(verify.prepare(`
      SELECT count(*) AS count FROM analysis_events
      WHERE workspace_id = ? AND analysis_id = ?
    `).get("ws_active_analysis", "analysis_active")).toEqual({ count: 0 });
  });

  it("keeps database and existing sidecars private to the service user", () => {
    const dbPath = databasePath();
    const database = open(dbPath);
    database.transaction(() => {
      database.prepare("INSERT INTO workspace_tombstones VALUES (?, ?)")
        .run("permission-check", "2026-07-25T00:00:00.000Z");
    });
    for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        expect(statSync(candidate).mode & 0o777).toBe(0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    chmodSync(dbPath, 0o600);
  });
});
