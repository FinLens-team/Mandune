import { describe, expect, it } from "vitest";
import { UnconfiguredAuthorizedMarketEvidenceSource } from "./market-evidence.js";

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
