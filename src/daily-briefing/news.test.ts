import { describe, expect, it } from "vitest";

import { normalizeDailyNews } from "./news.js";

describe("daily briefing news normalization", () => {
  it("keeps only recent, relevant, citable items and deduplicates titles", () => {
    const value = normalizeDailyNews({
      status: "completed",
      results: [
        {
          provider: "eastmoney",
          title: "央行开展公开市场逆回购操作",
          summary: "人民银行公告当日公开市场操作信息。",
          publishedAt: "2026-08-16 18:00:00",
          url: "https://finance.eastmoney.com/a/valid-macro.html",
        },
        {
          provider: "10jqka",
          title: "【央行开展公开市场逆回购操作】",
          summary: "同一事件的聚合转载。",
          publishedAt: "2026-08-16 18:05:00",
          url: "https://news.10jqka.com.cn/duplicate.shtml",
        },
        {
          provider: "eastmoney",
          title: "股票型ETF周度资金变化",
          summary: "A股宽基ETF出现资金净流出。",
          publishedAt: "2026-08-16 17:30:00",
          url: "https://finance.eastmoney.com/a/valid-market.html",
        },
        {
          provider: "eastmoney",
          title: "央行未来公告",
          summary: "发布时间晚于日报生成时点。",
          publishedAt: "2026-08-16 20:00:00",
          url: "https://finance.eastmoney.com/a/future.html",
        },
        {
          provider: "eastmoney",
          title: "明星参加综艺节目",
          summary: "与宏观和市场无关。",
          publishedAt: "2026-08-16 18:30:00",
          url: "https://finance.eastmoney.com/a/irrelevant.html",
        },
        {
          provider: "eastmoney",
          title: "统计局发布历史数据",
          summary: "超过四十八小时回溯窗口。",
          publishedAt: "2026-08-13 18:00:00",
          url: "https://finance.eastmoney.com/a/stale.html",
        },
        {
          provider: "eastmoney",
          title: "证监会发布市场政策",
          summary: "域名不在受信聚合来源白名单。",
          publishedAt: "2026-08-16 18:30:00",
          url: "https://example.com/untrusted.html",
        },
      ],
    }, new Date("2026-08-16T11:00:00Z"));

    expect(value.news).toHaveLength(2);
    expect(value.sources).toHaveLength(2);
    expect(value.news.map((item) => item.title)).toEqual([
      "央行开展公开市场逆回购操作",
      "股票型ETF周度资金变化",
    ]);
    expect(value.news[0]).toMatchObject({
      published_at: "2026-08-16T10:00:00.000Z",
      importance: "high",
      related_assets: ["中国宏观"],
    });
    expect(value.news[1]).toMatchObject({ importance: "medium", related_assets: ["A股"] });
    expect(value.sources.every((source) => source.id.startsWith("news-") && source.url.startsWith("https://"))).toBe(true);
  });

  it("fails closed on malformed worker output", () => {
    expect(normalizeDailyNews({ status: "failed", results: [] }, new Date())).toEqual({ news: [], sources: [] });
    expect(normalizeDailyNews(null, new Date())).toEqual({ news: [], sources: [] });
  });
});
