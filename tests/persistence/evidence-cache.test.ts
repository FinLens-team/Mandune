import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
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

function store(): SqliteEvidenceCacheStore {
  const root = mkdtempSync(path.join(tmpdir(), "mandong-evidence-cache-"));
  roots.push(root);
  const database = openSqliteDatabase({
    dbPath: path.join(root, "mandong.sqlite3"),
    migrationsDirectory: path.resolve("migrations"),
  });
  databases.push(database);
  return new SqliteEvidenceCacheStore(database);
}

describe("SQLite daily-review evidence cache", () => {
  it("upserts and retrieves a market observation by immutable cache key", () => {
    const cache = store();
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
    const cache = store();
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
    const cache = store();
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
