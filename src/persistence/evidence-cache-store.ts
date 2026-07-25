import { createHash } from "node:crypto";
import type { AssetClass } from "../contracts/index.js";
import type { SqliteDatabase } from "./database.js";

export type SourceTier = "official" | "trusted_media" | "other";

export interface MarketObservationCacheRecord {
  provider: string;
  method: string;
  assetClass: AssetClass;
  symbol: string;
  tradingDay: string;
  status: string;
  payload: unknown;
  observedAt?: string;
  fetchedAt: string;
  lastErrorCode?: string;
}

export interface AssetProfileCacheRecord {
  provider: string;
  assetClass: AssetClass;
  symbol: string;
  status: string;
  payload: unknown;
  fetchedAt: string;
  refreshAfter: string;
  lastErrorCode?: string;
}

export interface EventSearchCacheRecord {
  queryHash: string;
  query: unknown;
  status: string;
  payload: unknown;
  fetchedAt: string;
  refreshAfter: string;
  lastErrorCode?: string;
  candidates: EventCandidateCacheRecord[];
}

export interface EventCandidateCacheRecord {
  candidateId: string;
  queryHash: string;
  title: string;
  url: string;
  siteName?: string;
  publishedAt?: string;
  sourceTier: SourceTier;
  verificationStatus: string;
  fetchedAt: string;
}

export interface SourceDocumentCacheRecord {
  url: string;
  sourceTier: SourceTier;
  status: string;
  title?: string;
  publishedAt?: string;
  excerpt?: string;
  fetchedAt: string;
  refreshAfter: string;
  lastErrorCode?: string;
}

interface MarketRow {
  provider: string;
  method: string;
  asset_class: AssetClass;
  symbol: string;
  trading_day: string;
  status: string;
  payload_json: string;
  observed_at: string | null;
  fetched_at: string;
  last_error_code: string | null;
}

interface AssetProfileRow {
  provider: string;
  asset_class: AssetClass;
  symbol: string;
  status: string;
  payload_json: string;
  fetched_at: string;
  refresh_after: string;
  last_error_code: string | null;
}

interface EventSearchRow {
  query_hash: string;
  query_json: string;
  status: string;
  payload_json: string;
  fetched_at: string;
  refresh_after: string;
  last_error_code: string | null;
}

interface EventCandidateRow {
  candidate_id: string;
  query_hash: string;
  title: string;
  url: string;
  site_name: string | null;
  published_at: string | null;
  source_tier: SourceTier;
  verification_status: string;
  fetched_at: string;
}

interface SourceDocumentRow {
  url: string;
  source_tier: SourceTier;
  status: string;
  title: string | null;
  published_at: string | null;
  excerpt: string | null;
  fetched_at: string;
  refresh_after: string;
  last_error_code: string | null;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function nullable(value: string | undefined): string | null {
  return value ?? null;
}

function marketFrom(row: MarketRow): MarketObservationCacheRecord {
  return {
    provider: row.provider,
    method: row.method,
    assetClass: row.asset_class,
    symbol: row.symbol,
    tradingDay: row.trading_day,
    status: row.status,
    payload: JSON.parse(row.payload_json) as unknown,
    ...(row.observed_at ? { observedAt: row.observed_at } : {}),
    fetchedAt: row.fetched_at,
    ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
  };
}

function candidateFrom(row: EventCandidateRow): EventCandidateCacheRecord {
  return {
    candidateId: row.candidate_id,
    queryHash: row.query_hash,
    title: row.title,
    url: row.url,
    ...(row.site_name ? { siteName: row.site_name } : {}),
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
    sourceTier: row.source_tier,
    verificationStatus: row.verification_status,
    fetchedAt: row.fetched_at,
  };
}

export function cacheEntryIsFresh(refreshAfter: string, now: Date): boolean {
  const boundary = Date.parse(refreshAfter);
  return Number.isFinite(boundary) && boundary > now.getTime();
}

export class SqliteEvidenceCacheStore {
  constructor(private readonly database: SqliteDatabase) {}

  getMarket(input: {
    provider: string;
    method: string;
    assetClass: AssetClass;
    symbol: string;
    tradingDay: string;
  }): MarketObservationCacheRecord | null {
    return this.database.read(() => {
      const row = this.database.prepare(`
        SELECT provider, method, asset_class, symbol, trading_day, status,
          payload_json, observed_at, fetched_at, last_error_code
        FROM market_observations
        WHERE provider = ? AND method = ? AND asset_class = ? AND symbol = ? AND trading_day = ?
      `).get(
        input.provider,
        input.method,
        input.assetClass,
        input.symbol,
        input.tradingDay,
      ) as MarketRow | undefined;
      return row ? marketFrom(row) : null;
    });
  }

  putMarket(record: MarketObservationCacheRecord): void {
    const payload = json(record.payload);
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO market_observations (
          provider, method, asset_class, symbol, trading_day, status,
          payload_json, observed_at, fetched_at, content_hash, last_error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, method, asset_class, symbol, trading_day) DO UPDATE SET
          status = excluded.status,
          payload_json = excluded.payload_json,
          observed_at = excluded.observed_at,
          fetched_at = excluded.fetched_at,
          content_hash = excluded.content_hash,
          last_error_code = excluded.last_error_code
      `).run(
        record.provider,
        record.method,
        record.assetClass,
        record.symbol,
        record.tradingDay,
        record.status,
        payload,
        nullable(record.observedAt),
        record.fetchedAt,
        hash(payload),
        nullable(record.lastErrorCode),
      );
    });
  }

  getAssetProfile(input: {
    provider: string;
    assetClass: AssetClass;
    symbol: string;
  }): AssetProfileCacheRecord | null {
    return this.database.read(() => {
      const row = this.database.prepare(`
        SELECT provider, asset_class, symbol, status, payload_json, fetched_at,
          refresh_after, last_error_code
        FROM asset_profiles
        WHERE provider = ? AND asset_class = ? AND symbol = ?
      `).get(input.provider, input.assetClass, input.symbol) as AssetProfileRow | undefined;
      return row ? {
        provider: row.provider,
        assetClass: row.asset_class,
        symbol: row.symbol,
        status: row.status,
        payload: JSON.parse(row.payload_json) as unknown,
        fetchedAt: row.fetched_at,
        refreshAfter: row.refresh_after,
        ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
      } : null;
    });
  }

  putAssetProfile(record: AssetProfileCacheRecord): void {
    const payload = json(record.payload);
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO asset_profiles (
          provider, asset_class, symbol, status, payload_json, fetched_at,
          refresh_after, content_hash, last_error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, asset_class, symbol) DO UPDATE SET
          status = excluded.status,
          payload_json = excluded.payload_json,
          fetched_at = excluded.fetched_at,
          refresh_after = excluded.refresh_after,
          content_hash = excluded.content_hash,
          last_error_code = excluded.last_error_code
      `).run(
        record.provider,
        record.assetClass,
        record.symbol,
        record.status,
        payload,
        record.fetchedAt,
        record.refreshAfter,
        hash(payload),
        nullable(record.lastErrorCode),
      );
    });
  }

  getEventSearch(queryHash: string): EventSearchCacheRecord | null {
    return this.database.read(() => {
      const row = this.database.prepare(`
        SELECT query_hash, query_json, status, payload_json, fetched_at,
          refresh_after, last_error_code
        FROM event_searches WHERE query_hash = ?
      `).get(queryHash) as EventSearchRow | undefined;
      if (!row) return null;
      const candidates = this.database.prepare(`
        SELECT candidate_id, query_hash, title, url, site_name, published_at,
          source_tier, verification_status, fetched_at
        FROM event_candidates WHERE query_hash = ?
        ORDER BY source_tier, published_at DESC, candidate_id
      `).all(queryHash) as unknown as EventCandidateRow[];
      return {
        queryHash: row.query_hash,
        query: JSON.parse(row.query_json) as unknown,
        status: row.status,
        payload: JSON.parse(row.payload_json) as unknown,
        fetchedAt: row.fetched_at,
        refreshAfter: row.refresh_after,
        ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
        candidates: candidates.map(candidateFrom),
      };
    });
  }

  putEventSearch(record: EventSearchCacheRecord): void {
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO event_searches (
          query_hash, query_json, status, payload_json, fetched_at,
          refresh_after, last_error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(query_hash) DO UPDATE SET
          query_json = excluded.query_json,
          status = excluded.status,
          payload_json = excluded.payload_json,
          fetched_at = excluded.fetched_at,
          refresh_after = excluded.refresh_after,
          last_error_code = excluded.last_error_code
      `).run(
        record.queryHash,
        json(record.query),
        record.status,
        json(record.payload),
        record.fetchedAt,
        record.refreshAfter,
        nullable(record.lastErrorCode),
      );
      this.database.prepare("DELETE FROM event_candidates WHERE query_hash = ?").run(record.queryHash);
      const insert = this.database.prepare(`
        INSERT INTO event_candidates (
          candidate_id, query_hash, title, url, site_name, published_at,
          source_tier, verification_status, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const candidate of record.candidates) {
        insert.run(
          candidate.candidateId,
          record.queryHash,
          candidate.title,
          candidate.url,
          nullable(candidate.siteName),
          nullable(candidate.publishedAt),
          candidate.sourceTier,
          candidate.verificationStatus,
          candidate.fetchedAt,
        );
      }
    });
  }

  getSourceDocument(url: string): SourceDocumentCacheRecord | null {
    return this.database.read(() => {
      const row = this.database.prepare(`
        SELECT url, source_tier, status, title, published_at, excerpt,
          fetched_at, refresh_after, last_error_code
        FROM source_documents WHERE url_hash = ?
      `).get(hash(url)) as SourceDocumentRow | undefined;
      return row ? {
        url: row.url,
        sourceTier: row.source_tier,
        status: row.status,
        ...(row.title ? { title: row.title } : {}),
        ...(row.published_at ? { publishedAt: row.published_at } : {}),
        ...(row.excerpt ? { excerpt: row.excerpt } : {}),
        fetchedAt: row.fetched_at,
        refreshAfter: row.refresh_after,
        ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
      } : null;
    });
  }

  putSourceDocument(record: SourceDocumentCacheRecord): void {
    const contentHash = record.excerpt ? hash(record.excerpt) : null;
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO source_documents (
          url_hash, url, source_tier, status, title, published_at, excerpt,
          fetched_at, refresh_after, content_hash, last_error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(url_hash) DO UPDATE SET
          url = excluded.url,
          source_tier = excluded.source_tier,
          status = excluded.status,
          title = excluded.title,
          published_at = excluded.published_at,
          excerpt = excluded.excerpt,
          fetched_at = excluded.fetched_at,
          refresh_after = excluded.refresh_after,
          content_hash = excluded.content_hash,
          last_error_code = excluded.last_error_code
      `).run(
        hash(record.url),
        record.url,
        record.sourceTier,
        record.status,
        nullable(record.title),
        nullable(record.publishedAt),
        nullable(record.excerpt),
        record.fetchedAt,
        record.refreshAfter,
        contentHash,
        nullable(record.lastErrorCode),
      );
    });
  }
}
