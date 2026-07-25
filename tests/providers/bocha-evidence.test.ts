import { describe, expect, it } from "vitest";
import type {
  EventSearchCacheRecord,
  SourceDocumentCacheRecord,
} from "../../src/persistence/index.js";
import {
  BochaEvidenceCollector,
  BochaWebSearchClient,
  sourceTierForUrl,
  type BochaEvidenceCache,
} from "../../src/providers/index.js";

class MemoryEvidenceCache implements BochaEvidenceCache {
  readonly searches = new Map<string, EventSearchCacheRecord>();
  readonly documents = new Map<string, SourceDocumentCacheRecord>();

  getEventSearch(queryHash: string): EventSearchCacheRecord | null {
    return structuredClone(this.searches.get(queryHash) ?? null);
  }

  putEventSearch(record: EventSearchCacheRecord): void {
    this.searches.set(record.queryHash, structuredClone(record));
  }

  getSourceDocument(url: string): SourceDocumentCacheRecord | null {
    return structuredClone(this.documents.get(url) ?? null);
  }

  putSourceDocument(record: SourceDocumentCacheRecord): void {
    this.documents.set(record.url, structuredClone(record));
  }
}

describe("Bocha cached event evidence", () => {
  it("promotes only relevant allowlisted source text and reuses both caches", async () => {
    const requests: { url: string; body?: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, ...(typeof init?.body === "string" ? { body: init.body } : {}) });
      if (url.includes("api.bocha.cn")) {
        return new Response(JSON.stringify({
          code: 200,
          data: {
            webPages: {
              value: [{
                name: "平安银行公告",
                url: "https://www.sse.com.cn/disclosure/000001",
                siteName: "上海证券交易所",
                datePublished: "2026-07-24T08:00:00+08:00",
                summary: "搜索摘要不能进入证据",
              }],
            },
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("<html><title>平安银行公告</title><body>000001 平安银行公开事项</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };
    const cache = new MemoryEvidenceCache();
    const collector = new BochaEvidenceCollector(
      new BochaWebSearchClient("test-key", fetchImpl),
      cache,
      () => new Date("2026-07-25T00:00:00.000Z"),
    );
    const input = {
      lines: [{ lineId: "line-stock", symbol: "000001.SZ", name: "平安银行" }],
      tradingDay: "2026-07-24",
      signal: new AbortController().signal,
    };

    const first = await collector.collect(input);
    const second = await collector.collect(input);

    expect(first.evidence).toEqual([
      expect.objectContaining({ status: "available", metric_or_event_type: "verified_event" }),
    ]);
    expect(first.evidence[0]?.value).not.toContain("搜索摘要不能进入证据");
    expect(second.evidence).toEqual(first.evidence);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toContain("平安银行 000001.SZ 公告 2026-07-24");
    expect(requests[0]?.body).not.toMatch(/金额|约束|账户/);
  });

  it("keeps untrusted or irrelevant results unverified", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.bocha.cn")) {
        return new Response(JSON.stringify({
          code: 200,
          data: { webPages: { value: [{ name: "无关页面", url: "https://example.com/story" }] } },
        }), { status: 200 });
      }
      throw new Error("untrusted source must not be fetched");
    };
    const collector = new BochaEvidenceCollector(
      new BochaWebSearchClient("test-key", fetchImpl),
      new MemoryEvidenceCache(),
      () => new Date("2026-07-25T00:00:00.000Z"),
    );
    const result = await collector.collect({
      lines: [{ lineId: "line-etf", symbol: "510300.SH", name: "沪深300ETF" }],
      tradingDay: "2026-07-24",
      signal: new AbortController().signal,
    });

    expect(result.evidence).toEqual([
      expect.objectContaining({ status: "unverified", metric_or_event_type: "candidate_event" }),
    ]);
  });

  it("grades official, trusted-media and other HTTPS sources", () => {
    expect(sourceTierForUrl("https://www.sse.com.cn/disclosure/a")).toBe("official");
    expect(sourceTierForUrl("https://www.stcn.com/article/a")).toBe("trusted_media");
    expect(sourceTierForUrl("https://example.com/a")).toBe("other");
    expect(sourceTierForUrl("http://www.sse.com.cn/a")).toBe("other");
  });
});
