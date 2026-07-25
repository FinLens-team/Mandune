import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  SQLITE_SCHEMA_VERSION,
  SqliteEvidenceCacheStore,
  cacheEntryIsFresh,
  openSqliteDatabase,
  type SqliteDatabase,
} from "../../src/persistence/index.js";

const roots: string[] = [];
const databases: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryPath(): string {
  const root = mkdtempSync(path.join(tmpdir(), "mandong-evidence-cache-"));
  roots.push(root);
  return path.join(root, "mandong.sqlite3");
}

function open(dbPath = temporaryPath()): { database: SqliteDatabase; cache: SqliteEvidenceCacheStore } {
  const database = openSqliteDatabase({
    dbPath,
    migrationsDirectory: path.resolve("migrations"),
  });
  databases.push(database);
  return { database, cache: new SqliteEvidenceCacheStore(database) };
}

describe("SQLite daily-review evidence cache", () => {
  it("upgrades an Atlas v3 database through the evidence-cache and multi-card schemas", () => {
    const dbPath = temporaryPath();
    const raw = new DatabaseSync(dbPath);
    for (const filename of ["001-initial.sql", "002-journey-backend.sql", "003-atlas.sql"]) {
      raw.exec(readFileSync(path.resolve("migrations", filename), "utf8"));
    }
    raw.exec("CREATE TABLE preserved_atlas_marker(value TEXT NOT NULL)");
    raw.exec("INSERT INTO preserved_atlas_marker VALUES ('preserved')");
    raw.exec("PRAGMA user_version = 3");
    raw.close();

    const { database } = open(dbPath);
    expect(SQLITE_SCHEMA_VERSION).toBe(5);
    expect(database.prepare("PRAGMA user_version").get()).toEqual({ user_version: 5 });
    expect(database.prepare("SELECT value FROM preserved_atlas_marker").get()).toEqual({ value: "preserved" });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'market_observations'").get())
      .toEqual({ name: "market_observations" });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'atlas_run_cards'").get())
      .toEqual({ name: "atlas_run_cards" });
  });

  it("upserts and retrieves a market observation by immutable cache key", () => {
    const { cache } = open();
    cache.putMarket({
      provider: "pandaai",
      method: "market_daily",
      assetClass: "a_share",
      symbol: "000001.SZ",
      tradingDay: "2026-07-24",
      status: "available",
      payload: { close: 12.34, previous_close: 12.1 },
      observedAt: "2026-07-24",
      fetchedAt: "2026-07-25T00:00:00.000Z",
    });

    expect(cache.getMarket({
      provider: "pandaai",
      method: "market_daily",
      assetClass: "a_share",
      symbol: "000001.SZ",
      tradingDay: "2026-07-24",
    })).toMatchObject({
      status: "available",
      payload: { close: 12.34, previous_close: 12.1 },
    });
  });

  it("atomically replaces search candidates on refresh", () => {
    const { cache } = open();
    const base = {
      queryHash: "query-hash",
      query: { symbol: "510300.SH" },
      status: "available",
      payload: { count: 1 },
      fetchedAt: "2026-07-25T00:00:00.000Z",
      refreshAfter: "2026-07-25T06:00:00.000Z",
    };
    cache.putEventSearch({
      ...base,
      candidates: [{
        candidateId: "candidate-old",
        queryHash: base.queryHash,
        title: "旧公告",
        url: "https://www.sse.com.cn/old",
        sourceTier: "official",
        verificationStatus: "candidate",
        fetchedAt: base.fetchedAt,
      }],
    });
    cache.putEventSearch({
      ...base,
      fetchedAt: "2026-07-25T01:00:00.000Z",
      candidates: [{
        candidateId: "candidate-new",
        queryHash: base.queryHash,
        title: "新公告",
        url: "https://www.sse.com.cn/new",
        sourceTier: "official",
        verificationStatus: "verified",
        fetchedAt: "2026-07-25T01:00:00.000Z",
      }],
    });

    expect(cache.getEventSearch(base.queryHash)?.candidates).toEqual([
      expect.objectContaining({ candidateId: "candidate-new", verificationStatus: "verified" }),
    ]);
  });

  it("stores source documents and evaluates freshness by explicit boundary", () => {
    const { cache } = open();
    cache.putSourceDocument({
      url: "https://www.sse.com.cn/disclosure/example",
      sourceTier: "official",
      status: "verified",
      title: "交易所公告",
      excerpt: "公开测试摘要",
      fetchedAt: "2026-07-25T00:00:00.000Z",
      refreshAfter: "2026-07-26T00:00:00.000Z",
    });

    const document = cache.getSourceDocument("https://www.sse.com.cn/disclosure/example");
    expect(document).toMatchObject({ status: "verified", sourceTier: "official" });
    expect(cacheEntryIsFresh(document!.refreshAfter, new Date("2026-07-25T12:00:00.000Z"))).toBe(true);
    expect(cacheEntryIsFresh(document!.refreshAfter, new Date("2026-07-26T00:00:00.000Z"))).toBe(false);
  });
});
