import { createHash } from "node:crypto";
import type { EvidenceRecord } from "../contracts/index.js";
import { unverifiedEventEvidence, verifiedEventEvidence } from "../evidence/index.js";
import type {
  EventSearchCacheRecord,
  SourceDocumentCacheRecord,
} from "../persistence/evidence-cache-store.js";
import {
  BochaWebSearchClient,
  sourceTierForUrl,
  type BochaCandidate,
} from "./bocha.js";

const SEARCH_TTL_MS = 6 * 60 * 60 * 1_000;
const DOCUMENT_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_VERIFIED_SOURCES = 10;

export interface BochaEvidenceLine {
  lineId: string;
  symbol: string;
  name: string;
}

export interface BochaEvidenceCache {
  getEventSearch(queryHash: string): EventSearchCacheRecord | null;
  putEventSearch(record: EventSearchCacheRecord): void;
  getSourceDocument(url: string): SourceDocumentCacheRecord | null;
  putSourceDocument(record: SourceDocumentCacheRecord): void;
}

export interface BochaEvidenceResult {
  evidence: EvidenceRecord[];
  searchFailures: { lineId: string; status: string }[];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fresh(refreshAfter: string, now: Date): boolean {
  const boundary = Date.parse(refreshAfter);
  return Number.isFinite(boundary) && boundary > now.getTime();
}

function addMs(value: Date, milliseconds: number): string {
  return new Date(value.getTime() + milliseconds).toISOString();
}

function queryFor(line: BochaEvidenceLine, tradingDay: string): { query: string; queryHash: string } {
  const query = `${line.name} ${line.symbol} 公告 ${tradingDay}`.replace(/\s+/g, " ").trim();
  return { query, queryHash: hash(JSON.stringify({ query, freshness: "noLimit", count: 3 })) };
}

function relevant(line: BochaEvidenceLine, candidate: BochaCandidate, document: SourceDocumentCacheRecord): boolean {
  const text = `${candidate.title} ${document.title ?? ""} ${document.excerpt ?? ""}`
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN");
  const symbol = line.symbol.split(".")[0]?.toLocaleLowerCase("zh-CN") ?? "";
  const name = line.name.trim().toLocaleLowerCase("zh-CN");
  return (symbol.length >= 5 && text.includes(symbol)) || (name.length >= 2 && text.includes(name));
}

function cachedCandidates(record: EventSearchCacheRecord): BochaCandidate[] {
  return record.candidates.map((candidate) => ({
    id: candidate.candidateId,
    title: candidate.title,
    url: candidate.url,
    ...(candidate.siteName ? { siteName: candidate.siteName } : {}),
    ...(candidate.publishedAt ? { publishedAt: candidate.publishedAt } : {}),
  }));
}

export class BochaEvidenceCollector {
  private readonly searches = new Map<string, Promise<BochaCandidate[]>>();
  private readonly documents = new Map<string, Promise<SourceDocumentCacheRecord>>();

  constructor(
    private readonly client: BochaWebSearchClient,
    private readonly cache: BochaEvidenceCache,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async collect(input: {
    lines: readonly BochaEvidenceLine[];
    tradingDay: string;
    signal: AbortSignal;
  }): Promise<BochaEvidenceResult> {
    const evidence: EvidenceRecord[] = [];
    const searchFailures: BochaEvidenceResult["searchFailures"] = [];
    const acquiredAt = this.now().toISOString();
    const searches = await Promise.all(input.lines.map(async (line) => {
      try {
        return { line, candidates: await this.search(line, input.tradingDay, input.signal) };
      } catch (error) {
        searchFailures.push({
          lineId: line.lineId,
          status: input.signal.aborted ? "cancelled" : error instanceof Error ? error.message : "failed",
        });
        return { line, candidates: [] };
      }
    }));

    const seen = new Set<string>();
    const candidates = searches.flatMap(({ line, candidates: found }) => found.map((candidate) => ({ line, candidate })))
      .filter(({ candidate }) => {
        if (seen.has(candidate.url) || seen.size >= MAX_VERIFIED_SOURCES) return false;
        seen.add(candidate.url);
        return true;
      });

    for (const { line, candidate } of candidates) {
      const document = await this.document(candidate, input.signal);
      const tier = sourceTierForUrl(candidate.url);
      if (document.status === "verified" && document.excerpt &&
        (tier === "official" || tier === "trusted_media") && relevant(line, candidate, document)) {
        evidence.push(verifiedEventEvidence({
          lineId: line.lineId,
          symbol: line.symbol,
          candidate,
          acquiredAt,
          excerpt: document.excerpt,
          sourceTier: tier,
        }));
      } else {
        evidence.push(unverifiedEventEvidence({
          lineId: line.lineId,
          symbol: line.symbol,
          candidate,
          acquiredAt,
        }));
      }
    }

    return { evidence, searchFailures };
  }

  private async search(line: BochaEvidenceLine, tradingDay: string, signal: AbortSignal): Promise<BochaCandidate[]> {
    const { query, queryHash } = queryFor(line, tradingDay);
    const cached = this.cache.getEventSearch(queryHash);
    if (cached && fresh(cached.refreshAfter, this.now())) return cachedCandidates(cached);
    const existing = this.searches.get(queryHash);
    if (existing) return existing;
    const task = (async () => {
      const fetchedAt = this.now().toISOString();
      const result = await this.client.search({ query, count: 3, freshness: "noLimit", signal });
      const candidates = result.status === "available" ? result.candidates : [];
      this.cache.putEventSearch({
        queryHash,
        query: { query, freshness: "noLimit", count: 3 },
        status: result.status,
        payload: { candidateCount: candidates.length },
        fetchedAt,
        refreshAfter: addMs(this.now(), result.status === "available" ? SEARCH_TTL_MS : 5 * 60 * 1_000),
        ...(result.status === "failed" || result.status === "rate_limited" || result.status === "malformed"
          ? { lastErrorCode: result.reason }
          : {}),
        candidates: candidates.map((candidate) => ({
          candidateId: candidate.id,
          queryHash,
          title: candidate.title,
          url: candidate.url,
          ...(candidate.siteName ? { siteName: candidate.siteName } : {}),
          ...(candidate.publishedAt ? { publishedAt: candidate.publishedAt } : {}),
          sourceTier: sourceTierForUrl(candidate.url),
          verificationStatus: "candidate",
          fetchedAt,
        })),
      });
      if (result.status === "failed" || result.status === "rate_limited" || result.status === "malformed") {
        throw new Error(result.reason);
      }
      return candidates;
    })().finally(() => this.searches.delete(queryHash));
    this.searches.set(queryHash, task);
    return task;
  }

  private async document(candidate: BochaCandidate, signal: AbortSignal): Promise<SourceDocumentCacheRecord> {
    const cached = this.cache.getSourceDocument(candidate.url);
    if (cached && fresh(cached.refreshAfter, this.now())) return cached;
    const existing = this.documents.get(candidate.url);
    if (existing) return existing;
    const task = (async () => {
      const fetchedAt = this.now().toISOString();
      const result = await this.client.fetchSourceDocument(candidate, signal);
      const record: SourceDocumentCacheRecord = result.status === "available"
        ? {
            url: candidate.url,
            sourceTier: result.sourceTier,
            status: "verified",
            ...(result.title ? { title: result.title } : {}),
            ...(candidate.publishedAt ? { publishedAt: candidate.publishedAt } : {}),
            excerpt: result.excerpt,
            fetchedAt,
            refreshAfter: addMs(this.now(), DOCUMENT_TTL_MS),
          }
        : {
            url: candidate.url,
            sourceTier: result.sourceTier,
            status: "unverified",
            ...(candidate.publishedAt ? { publishedAt: candidate.publishedAt } : {}),
            fetchedAt,
            refreshAfter: addMs(this.now(), 5 * 60 * 1_000),
            lastErrorCode: result.reason,
          };
      this.cache.putSourceDocument(record);
      return record;
    })().finally(() => this.documents.delete(candidate.url));
    this.documents.set(candidate.url, task);
    return task;
  }
}
