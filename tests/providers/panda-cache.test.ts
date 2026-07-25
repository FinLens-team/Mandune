import { describe, expect, it } from "vitest";
import { getFixture } from "../../src/fixtures/index.js";
import type { MarketObservationCacheRecord } from "../../src/persistence/index.js";
import {
  CachedPandaEvidenceCollector,
  type PandaBatchResult,
  type PandaMarketCache,
} from "../../src/providers/index.js";

class MemoryMarketCache implements PandaMarketCache {
  readonly records = new Map<string, MarketObservationCacheRecord>();

  private key(input: { assetClass: string; symbol: string; tradingDay: string }): string {
    return `${input.assetClass}:${input.symbol}:${input.tradingDay}`;
  }

  getMarket(input: {
    provider: string;
    method: string;
    assetClass: "a_share" | "etf" | "fund";
    symbol: string;
    tradingDay: string;
  }): MarketObservationCacheRecord | null {
    return structuredClone(this.records.get(this.key(input)) ?? null);
  }

  putMarket(record: MarketObservationCacheRecord): void {
    this.records.set(this.key(record), structuredClone(record));
  }
}

describe("cached PandaAI batch evidence", () => {
  it("fetches all cache misses in one batch and reuses the stored series", async () => {
    const snapshot = structuredClone(getFixture("supported_full").snapshot);
    let calls = 0;
    const client = {
      collect: async (requests: readonly { lineId: string; assetClass: "a_share" | "etf" | "fund"; symbol: string }[]) => {
        calls += 1;
        return requests.map<PandaBatchResult>((request) => ({
          ...request,
          status: "available",
          method: "get_market_data",
          rows: [
            { date: "2026-07-23", metric: request.assetClass === "fund" ? "nav" : "close", value: 100 },
            { date: "2026-07-24", metric: request.assetClass === "fund" ? "nav" : "close", value: 102 },
          ],
        }));
      },
    };
    const cache = new MemoryMarketCache();
    const collector = new CachedPandaEvidenceCollector(
      client,
      cache,
      () => new Date("2026-07-25T01:00:00.000Z"),
    );
    const input = { snapshot, tradingDay: "2026-07-24", signal: new AbortController().signal };

    const first = await collector.collect(input);
    const second = await collector.collect(input);

    expect(calls).toBe(1);
    expect(first.failures).toEqual([]);
    expect(first.evidence).toHaveLength(snapshot.lines.length * 2);
    expect(first.evidence.every((item) => item.status === "ambiguous" && item.unit === undefined)).toBe(true);
    expect(second).toEqual(first);
  });

  it("preserves per-line unsupported and failure results", async () => {
    const snapshot = structuredClone(getFixture("supported_full").snapshot);
    const collector = new CachedPandaEvidenceCollector({
      collect: async (requests) => requests.map((request, index) => ({
        ...request,
        status: index === 0 ? "unsupported" : "failed",
        method: null,
        rows: [],
        errorCode: index === 0 ? "sdk_method_missing" : "provider_failed",
      })),
    }, new MemoryMarketCache(), () => new Date("2026-07-25T01:00:00.000Z"));

    const result = await collector.collect({
      snapshot,
      tradingDay: "2026-07-24",
      signal: new AbortController().signal,
    });
    expect(result.failures).toHaveLength(snapshot.lines.length);
    expect(result.evidence.map((item) => item.status)).toContain("unsupported");
    expect(result.evidence.map((item) => item.status)).toContain("failed");
  });
});
