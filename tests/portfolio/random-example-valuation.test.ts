import { describe, expect, it, vi } from "vitest";
import type { MarketEvidenceSource } from "../../src/analysis/index.js";
import { RandomExampleValuationService } from "../../src/app/server/random-example-valuation.js";

const NOW = new Date("2026-08-01T08:00:00.000Z");

function publicEvidenceSource(): MarketEvidenceSource {
  return {
    collectMarketEvidence: vi.fn(async (input) => [
      {
        id: "history",
        scope: { kind: "asset" as const, line_id: input.lineId, symbol: input.symbol },
        metric_or_event_type: "close" as const,
        value: 10,
        unit: "CNY",
        normalization_note: "unitless_return_eligible:same_provider_method",
        source: { name: "腾讯行情日 K", locator: "tencent:kline:sh600000:2026-07-01" },
        observation_or_event_time: "2026-07-01",
        fetched_at: input.acquiredAt,
        status: "ambiguous" as const,
        limitations: ["历史日 K。"],
        provenance: "observed" as const,
      },
      {
        id: "latest",
        scope: { kind: "asset" as const, line_id: input.lineId, symbol: input.symbol },
        metric_or_event_type: "close" as const,
        value: 12,
        unit: "CNY",
        normalization_note: "unitless_return_eligible:same_provider_method",
        source: { name: "腾讯行情日 K", locator: "tencent:kline:sh600000:2026-08-01" },
        observation_or_event_time: "2026-08-01",
        fetched_at: input.acquiredAt,
        status: "available" as const,
        limitations: ["公开延迟日 K，不是实时盘口。"],
        provenance: "observed" as const,
      },
    ]),
  };
}

describe("server random example valuation", () => {
  it("uses a public provider's latest and historical close to make the generated amounts reproducible", async () => {
    const source = publicEvidenceSource();
    const service = new RandomExampleValuationService({
      marketEvidenceSource: source,
      now: () => NOW,
      random: () => 0.1,
      createLineId: () => "line-server-example",
    });

    const example = await service.create({ excludedSymbols: new Set(["161725.OF"]) });
    if (!example) throw new Error("expected_server_example");

    expect(source.collectMarketEvidence).toHaveBeenCalledOnce();
    expect(example.line).toMatchObject({
      line_id: "line-server-example",
      entry_method: "example",
      current_market_value_cny: example.valuation.current_market_value_cny,
      cost_basis_cny: example.valuation.cost_basis_cny,
    });
    expect(example.valuation.source).toMatchObject({
      kind: "public_delayed",
      is_live: false,
      current_price_cny: 12,
      historical_price_cny: 10,
      observation_date: "2026-08-01",
      historical_observation_date: "2026-07-01",
    });
    expect(example.valuation.current_market_value_cny).toBeCloseTo(
      example.valuation.position_units * 12,
      2,
    );
    expect(example.valuation.cost_basis_cny).toBeCloseTo(
      example.valuation.position_units * 10,
      2,
    );
    expect(example.valuation.cash_balance_cny).toBeGreaterThan(0);
  });

  it("labels local generated pricing as a fallback when no provider row is usable", async () => {
    const service = new RandomExampleValuationService({
      marketEvidenceSource: { collectMarketEvidence: vi.fn(async () => []) },
      now: () => NOW,
      random: () => 0.2,
      createLineId: () => "line-local-fallback",
    });

    const example = await service.create();
    if (!example) throw new Error("expected_fallback_example");

    expect(example.valuation.source).toMatchObject({
      kind: "local_fallback",
      is_live: false,
      name: "本地演示估值（非实时行情）",
    });
    expect(example.valuation.source.limitations.join(" ")).toContain("公开行情未返回可用价格");
    expect(example.valuation.current_market_value_cny).toBeCloseTo(
      example.valuation.position_units * example.valuation.source.current_price_cny,
      2,
    );
    expect(example.valuation.cost_basis_cny).toBeCloseTo(
      example.valuation.position_units * example.valuation.source.historical_price_cny,
      2,
    );
  });
});
