import { describe, expect, it } from "vitest";
import { unverifiedEventEvidence } from "../../src/evidence/index.js";
import {
  BochaWebSearchClient,
  PandaEvidenceAdapter,
  isPrimarySourceUrl,
} from "../../src/providers/index.js";

const request = {
  lineId: "line-a-share",
  assetClass: "a_share" as const,
  symbol: "000001.SZ",
  acquiredAt: "2026-07-24T09:00:00+08:00",
  latestCompleteTradingDay: "2026-07-23",
  signal: new AbortController().signal,
};

describe("Panda evidence adapter", () => {
  it("normalizes only accepted A-share market rows without inventing a unit", async () => {
    const adapter = new PandaEvidenceAdapter({
      getAShareMarketData: async () => ({
        status: "available",
        rows: [{ date: "2026-07-23", close: 10.5 }],
      }),
    });

    const [evidence] = await adapter.collectMarketEvidence(request);
    expect(evidence).toBeDefined();
    if (!evidence) return;
    expect(evidence).toMatchObject({
      status: "available",
      value: 10.5,
      observation_or_event_time: "2026-07-23T00:00:00+08:00",
    });
    expect(evidence.unit).toBeUndefined();
    expect(evidence.limitations.join(" ")).toContain("unit remains unknown");
  });

  it("does not claim ETF market coverage from the rejected runtime path", async () => {
    const adapter = new PandaEvidenceAdapter({
      getAShareMarketData: async () => ({ status: "available", rows: [] }),
    });
    const result = await adapter.collectMarketEvidence({ ...request, assetClass: "etf" });
    expect(result[0]).toMatchObject({ status: "unsupported", value: null });
  });

  it("maps cancelled provider calls to a non-current failed record", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = new PandaEvidenceAdapter({
      getAShareMarketData: async () => {
        throw new Error("cancelled");
      },
    });
    const result = await adapter.collectMarketEvidence({ ...request, signal: controller.signal });
    expect(result[0]).toMatchObject({ status: "failed", value: null });
    expect(result[0]?.limitations[0]).toContain("cancelled");
  });

  it.each([
    ["empty", "ambiguous"],
    ["stale", "stale"],
    ["ambiguous", "ambiguous"],
    ["unsupported", "unsupported"],
    ["conflicting", "conflicting"],
    ["rate_limited", "rate_limited"],
    ["failed", "failed"],
  ] as const)("maps %s provider results to %s evidence", async (providerStatus, evidenceStatus) => {
    const adapter = new PandaEvidenceAdapter({
      getAShareMarketData: async () => ({
        status: providerStatus,
        rows: [],
        limitation: `fixture ${providerStatus}`,
      }),
    });

    const [evidence] = await adapter.collectMarketEvidence(request);
    expect(evidence?.status).toBe(evidenceStatus);
    expect(evidence?.value).toBeNull();
  });
});

describe("Bocha discovery boundary", () => {
  it("rejects out-of-range count before making a network request", async () => {
    let calls = 0;
    const client = new BochaWebSearchClient("secret", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });
    const result = await client.search({ query: "ETF 公告", count: 51, signal: request.signal });
    expect(result).toMatchObject({ status: "failed", reason: "count_out_of_range" });
    expect(calls).toBe(0);
  });

  it("keeps provider summaries out of candidates and preserves them as discovery only", async () => {
    const client = new BochaWebSearchClient("secret", async () =>
      new Response(
        JSON.stringify({
          code: 200,
          data: {
            webPages: {
              value: [
                {
                  name: "交易所公告",
                  url: "https://www.sse.com.cn/disclosure/example",
                  siteName: "上海证券交易所",
                  datePublished: "2026-07-23T08:00:00+08:00",
                  summary: "must never enter evidence",
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );
    const result = await client.search({ query: "ETF 公告", count: 3, signal: request.signal });
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.candidates[0]).not.toHaveProperty("summary");
    const evidence = unverifiedEventEvidence({
      lineId: "line-etf",
      symbol: "510300.SH",
      candidate: result.candidates[0]!,
      acquiredAt: request.acquiredAt,
    });
    expect(evidence).toMatchObject({ status: "unverified", value: null });
  });

  it("maps HTTP and business authentication or rate-limit responses without retaining a provider body", async () => {
    const cases = [
      [new Response("secret provider details", { status: 401 }), "failed", "http_401"],
      [new Response("{}", { status: 429 }), "rate_limited", "http_429"],
      [new Response(JSON.stringify({ code: 401, message: "secret" }), { status: 200 }), "failed", "auth_failed"],
    ] as const;

    for (const [response, status, reason] of cases) {
      const client = new BochaWebSearchClient("secret", async () => response);
      const result = await client.search({ query: "ETF 公告", count: 3, signal: request.signal });
      expect(result).toMatchObject({ status, reason });
      expect(JSON.stringify(result)).not.toContain("secret");
    }
  });

  it("only probes HTTPS allowlisted primary-source hosts and does not follow redirects", async () => {
    let calls = 0;
    const client = new BochaWebSearchClient("secret", async () => {
      calls += 1;
      return new Response(null, { status: 302, headers: { Location: "https://example.com" } });
    });
    expect(isPrimarySourceUrl("http://www.sse.com.cn/a")).toBe(false);
    expect(isPrimarySourceUrl("https://sub.sse.com.cn/a")).toBe(true);
    expect(
      await client.locatePrimarySource(
        { id: "1", title: "untrusted", url: "https://example.com/a" },
        request.signal,
      ),
    ).toBe("unavailable");
    expect(calls).toBe(0);
    expect(
      await client.locatePrimarySource(
        { id: "2", title: "redirect", url: "https://www.sse.com.cn/a" },
        request.signal,
      ),
    ).toBe("unavailable");
    expect(calls).toBe(1);
  });
});
