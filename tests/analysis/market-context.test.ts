import { describe, expect, it } from "vitest";
import { compileModelMarketContext } from "../../src/analysis/index.js";
import type { EvidenceRecord } from "../../src/contracts/index.js";

function marketSeries(count: number): EvidenceRecord[] {
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    const value = index < 100 ? 100 + index : index < 150 ? 199 - (index - 99) * 2 : 99 + (index - 149) * 3;
    return {
      id: `market-${index}`,
      scope: { kind: "asset", line_id: "line-1", symbol: "600519.SH" },
      metric_or_event_type: "close",
      value,
      unit: "CNY",
      normalization_note: "unitless_return_eligible:same_provider_method",
      source: { name: "Test daily K", locator: `test:${date}` },
      observation_or_event_time: date,
      fetched_at: "2026-01-01T00:00:00.000Z",
      status: index === count - 1 ? "available" : "ambiguous",
      limitations: [],
      provenance: "observed",
    } satisfies EvidenceRecord;
  });
}

describe("model market context", () => {
  it("compresses a year of observations into fixed multi-horizon summaries", () => {
    const context = compileModelMarketContext(marketSeries(252));
    const asset = context.assets[0]!;

    expect(asset.recent_observations).toHaveLength(3);
    expect(asset.windows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "近3个交易日", status: "available", sample_count: 3 }),
      expect.objectContaining({ label: "近1个月", status: "available", sample_count: 22 }),
      expect.objectContaining({ label: "近1年", status: "available", sample_count: 252 }),
    ]));
    expect(asset.windows.find((item) => item.label === "近1年")?.max_drawdown_pct).toBeLessThan(0);
    expect(JSON.stringify(context).length).toBeLessThan(3_500);
  });

  it("does not label an incomplete series as a one-year window", () => {
    const year = compileModelMarketContext(marketSeries(199)).assets[0]!.windows
      .find((item) => item.label === "近1年");
    expect(year).toMatchObject({ status: "insufficient", sample_count: 199 });
    expect(year?.limitation).toContain("未达到 200");
  });

  it("retains verified important events and excludes unverified candidates", () => {
    const verified: EvidenceRecord = {
      id: "event-verified",
      scope: { kind: "asset", line_id: "line-1", symbol: "600519.SH" },
      metric_or_event_type: "verified_event",
      value: "公司发布已核验公告。",
      source: { name: "交易所公告", locator: "https://example.com/notice" },
      observation_or_event_time: "2026-07-31T09:00:00.000Z",
      fetched_at: "2026-07-31T10:00:00.000Z",
      status: "available",
      limitations: [],
      provenance: "observed",
    };
    const candidate = { ...verified, id: "event-candidate", metric_or_event_type: "candidate_event", status: "unverified" as const };

    const context = compileModelMarketContext([...marketSeries(3), verified, candidate]);
    expect(context.important_events).toEqual([expect.objectContaining({ id: "event-verified" })]);
  });
});
