import { describe, expect, it } from "vitest";
import { TencentMarketEvidenceSource } from "../../src/providers/index.js";

function klines(rows: string[][]): object {
  return { data: { sh600000: { qfqday: rows } } };
}

describe("Tencent public market evidence", () => {
  it("returns the latest three valid trading days and excludes rows after the cutoff", async () => {
    const source = new TencentMarketEvidenceSource(
      async () => Response.json(klines([
        ["2026-07-22", "10", "10.1"],
        ["2026-07-23", "10.1", "10.2"],
        ["2026-07-24", "10.2", "10.4"],
        ["2026-07-25", "10.4", "10.3"],
        ["2026-07-26", "10.3", "99"],
      ])),
    );
    const evidence = await source.collectMarketEvidence({
      lineId: "line-1",
      assetClass: "a_share",
      symbol: "600000.SH",
      acquiredAt: "2026-07-26T08:00:00.000Z",
      latestCompleteTradingDay: "2026-07-25",
      signal: new AbortController().signal,
    });

    expect(evidence).toHaveLength(3);
    expect(evidence.map((item) => [item.observation_or_event_time, item.value, item.status])).toEqual([
      ["2026-07-23", 10.2, "ambiguous"],
      ["2026-07-24", 10.4, "ambiguous"],
      ["2026-07-25", 10.3, "available"],
    ]);
    expect(evidence.every((item) =>
      item.normalization_note === "unitless_return_eligible:same_provider_method")).toBe(true);
  });

  it("fails closed when fewer than three valid trading days are available", async () => {
    const source = new TencentMarketEvidenceSource(
      async () => Response.json(klines([
        ["2026-07-24", "10", "10.1"],
        ["2026-07-25", "10.1", "10.2"],
      ])),
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
      status: "failed",
      value: null,
    });
    expect(evidence[0]?.limitations.join(" ")).toContain("不足三个有效交易日");
  });
});
