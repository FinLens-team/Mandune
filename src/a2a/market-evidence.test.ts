import { describe, expect, it, vi } from "vitest";
import {
  PandaAuthorizedMarketEvidenceSource,
  UnconfiguredAuthorizedMarketEvidenceSource,
} from "./market-evidence.js";

describe("PandaAuthorizedMarketEvidenceSource", () => {
  it("adapts one authorized A2A request to the existing PandaAI collector", async () => {
    const collect = vi.fn(async () => ({
      evidence: [{
        id: "panda-market-line-example-close-2026-07-24",
        scope: { kind: "asset" as const, line_id: "line-example", symbol: "510300.SH" },
        metric_or_event_type: "close",
        value: 4.12,
        source: { name: "PandaAI get_market_data", locator: "pandaai:test" },
        observation_or_event_time: "2026-07-24",
        fetched_at: "2026-07-25T10:00:00.000Z",
        status: "ambiguous" as const,
        limitations: ["unit not verified"],
        provenance: "observed" as const,
      }],
      failures: [],
    }));
    const source = new PandaAuthorizedMarketEvidenceSource({ collect });
    const signal = new AbortController().signal;

    const result = await source.collectMarketEvidence({
      lineId: "line-example",
      assetClass: "etf",
      symbol: "510300.SH",
      acquiredAt: "2026-07-25T10:00:00.000Z",
      latestCompleteTradingDay: "2026-07-24",
      signal,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      value: 4.12,
      source: expect.objectContaining({ name: "PandaAI get_market_data" }),
    }));
    expect(collect).toHaveBeenCalledWith(expect.objectContaining({
      tradingDay: "2026-07-24",
      signal,
      snapshot: expect.objectContaining({
        lines: [expect.objectContaining({
          line_id: "line-example",
          asset_class: "etf",
          symbol: "510300.SH",
        })],
      }),
    }));
  });
});

describe("UnconfiguredAuthorizedMarketEvidenceSource", () => {
  it("fails closed without making an external request or fabricating a value", async () => {
    const source = new UnconfiguredAuthorizedMarketEvidenceSource();
    const result = await source.collectMarketEvidence({
      lineId: "line-example",
      assetClass: "etf",
      symbol: "510300.SH",
      acquiredAt: "2026-07-25T10:00:00.000Z",
      latestCompleteTradingDay: "2026-07-24",
      signal: new AbortController().signal,
    });

    expect(result).toEqual([expect.objectContaining({
      value: null,
      status: "failed",
      source: expect.objectContaining({ name: "a2a-market-data-unconfigured" }),
    })]);
    expect(result[0].limitations.join(" ")).toContain("未访问未授权第三方行情");
  });
});
