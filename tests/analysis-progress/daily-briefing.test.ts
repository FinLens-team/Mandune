import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_DAILY_BRIEFING,
  isDailyBriefing,
  loadDailyBriefing,
} from "../../src/features/analysis-progress/daily-briefing.js";

const VALID = {
  schema_version: "daily-briefing.v2",
  fact_sheet_id: "cn-market-2026-08-01-r1",
  date: "2026-08-01",
  generated_at: "2026-08-01T08:00:00+08:00",
  market_data_cutoff: "2026-07-31 15:00",
  theme_id: "sunge",
  title: "周末别 FOMO",
  dek: "先把时间线拉直。",
  market: [
    { label: "深证成指", value: "13578.93", change: "+2.21%", observed_at: "2026-07-31 15:00", source_id: "szse" },
  ],
  news: [
    {
      title: "证监会发布一项注册消息",
      summary: "仅记录官方发布事实。",
      published_at: "2026-07-31",
      source_id: "csrc",
      importance: "high",
      related_assets: ["商品期货"],
    },
  ],
  sections: [
    { heading: "行情截止", body: "周六休市。" },
    { heading: "组合结构", body: "先看整体。" },
  ],
  sources: [
    { id: "szse", name: "深圳证券交易所", url: "https://www.sse.org.cn/www/market/" },
    { id: "csrc", name: "中国证监会", url: "https://www.csrc.gov.cn/" },
  ],
  notice: "不构成个性化投资建议。",
} as const;

afterEach(() => vi.unstubAllGlobals());

describe("daily briefing", () => {
  it("accepts sourced market and news facts only for the requested theme", () => {
    expect(isDailyBriefing(VALID, "sunge")).toBe(true);
    expect(isDailyBriefing(VALID, "eastern_observation")).toBe(false);
    expect(isDailyBriefing({ ...VALID, sections: [] }, "sunge")).toBe(false);
    expect(isDailyBriefing({ ...VALID, news: [{ ...VALID.news[0], source_id: "missing" }] }, "sunge")).toBe(false);
    expect(isDailyBriefing({ ...VALID, schema_version: "daily-briefing.v1" }, "sunge")).toBe(false);
  });

  it("loads the selected pre-generated theme variant without caching stale days", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(VALID), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(loadDailyBriefing("sunge", undefined, new Date(2026, 7, 1))).resolves.toEqual(VALID);
    expect(fetch).toHaveBeenCalledWith("/daily-briefings/latest/sunge.json?date=2026-08-01", {});
  });

  it("falls back without invented market or news when the cache is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    await expect(loadDailyBriefing("zhouli")).resolves.toEqual({
      ...FALLBACK_DAILY_BRIEFING,
      theme_id: "zhouli",
    });
    expect(FALLBACK_DAILY_BRIEFING.market).toEqual([]);
    expect(FALLBACK_DAILY_BRIEFING.news).toEqual([]);
  });
});
