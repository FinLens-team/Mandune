import { describe, expect, it } from "vitest";
import { TencentMarketEvidenceSource } from "../../src/providers/index.js";

function quote(dateTime: string): string {
  const fields = Array.from({ length: 40 }, () => "");
  fields[3] = "12.34";
  fields[30] = dateTime;
  return `v_sh600000="${fields.join("~")}";`;
}

describe("Tencent public market evidence", () => {
  it("keeps a quote after the frozen cutoff ambiguous at its real observation date", async () => {
    const source = new TencentMarketEvidenceSource(
      async () => new Response(quote("20260726153000"), { status: 200 }),
    );
    const evidence = await source.collectMarketEvidence({
      lineId: "line-1",
      assetClass: "a_share",
      symbol: "600000.SH",
      acquiredAt: "2026-07-26T08:00:00.000Z",
      latestCompleteTradingDay: "2026-07-25",
      signal: new AbortController().signal,
    });

    expect(evidence[0]).toMatchObject({
      observation_or_event_time: "2026-07-26",
      status: "ambiguous",
      value: 12.34,
    });
  });

  it("accepts a quote on the frozen latest complete trading day", async () => {
    const source = new TencentMarketEvidenceSource(
      async () => new Response(quote("20260725150000"), { status: 200 }),
    );
    const evidence = await source.collectMarketEvidence({
      lineId: "line-1",
      assetClass: "a_share",
      symbol: "600000.SH",
      acquiredAt: "2026-07-25T08:00:00.000Z",
      latestCompleteTradingDay: "2026-07-25",
      signal: new AbortController().signal,
    });

    expect(evidence[0]).toMatchObject({
      observation_or_event_time: "2026-07-25",
      status: "available",
      value: 12.34,
    });
  });
});
