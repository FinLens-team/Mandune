import type { ThemeId } from "../../theme/index.js";

export interface DailyBriefingSection {
  heading: string;
  body: string;
}

export interface DailyBriefingMarketItem {
  label: string;
  value: string;
  change?: string;
  observed_at: string;
  source_id: string;
}

export interface DailyBriefingNewsItem {
  title: string;
  summary: string;
  published_at: string;
  source_id: string;
  importance: "high" | "medium";
  related_assets: readonly string[];
}

export interface DailyBriefingSource {
  id: string;
  name: string;
  url: string;
}

export interface DailyBriefing {
  schema_version: "daily-briefing.v2";
  fact_sheet_id: string;
  date: string;
  generated_at: string;
  market_data_cutoff: string;
  theme_id: ThemeId;
  title: string;
  dek: string;
  market: readonly DailyBriefingMarketItem[];
  news: readonly DailyBriefingNewsItem[];
  sections: readonly DailyBriefingSection[];
  sources: readonly DailyBriefingSource[];
  notice: string;
}

export const FALLBACK_DAILY_BRIEFING: DailyBriefing = {
  schema_version: "daily-briefing.v2",
  fact_sheet_id: "fallback-no-live-market-news",
  date: "",
  generated_at: "",
  market_data_cutoff: "暂未取得可核验行情",
  theme_id: "eastern_observation",
  title: "今日市场日报正在更新",
  dek: "行情和新闻只有经过来源核验后才会显示；更新期间不使用未核实信息填充。",
  market: [],
  news: [],
  sections: [
    {
      heading: "区分日期",
      body: "持仓确认日说明你何时确认了组合，行情截止日说明市场数据更新到了哪一天，两者不能混用。",
    },
    {
      heading: "区分事实与解释",
      body: "价格、涨跌和公告是事实层；原因归纳属于解释层。证据不足时，应保留未知，而不是补全故事。",
    },
  ],
  sources: [],
  notice: "日报是公开市场阅读材料，不使用你的持仓数据，也不构成个性化投资建议。",
};

const THEME_IDS = new Set<ThemeId>([
  "eastern_observation",
  "jixing_doudou",
  "sunge",
  "zhouli",
  "tieba_laoge",
  "male_succubus",
  "female_succubus",
]);

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSection(value: unknown): value is DailyBriefingSection {
  if (!value || typeof value !== "object") return false;
  const section = value as Record<string, unknown>;
  return nonEmpty(section.heading) && nonEmpty(section.body);
}

function isMarketItem(value: unknown, sourceIds: ReadonlySet<string>): value is DailyBriefingMarketItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return nonEmpty(item.label) && nonEmpty(item.value) && nonEmpty(item.observed_at) &&
    nonEmpty(item.source_id) && sourceIds.has(item.source_id) &&
    (item.change === undefined || nonEmpty(item.change));
}

function isNewsItem(value: unknown, sourceIds: ReadonlySet<string>): value is DailyBriefingNewsItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return nonEmpty(item.title) && nonEmpty(item.summary) && nonEmpty(item.published_at) &&
    nonEmpty(item.source_id) && sourceIds.has(item.source_id) &&
    (item.importance === "high" || item.importance === "medium") &&
    Array.isArray(item.related_assets) && item.related_assets.every(nonEmpty);
}

function isSource(value: unknown): value is DailyBriefingSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  if (!nonEmpty(source.id) || !nonEmpty(source.name) || !nonEmpty(source.url)) return false;
  try {
    const url = new URL(source.url);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function isDailyBriefing(value: unknown, themeId: ThemeId): value is DailyBriefing {
  if (!value || typeof value !== "object") return false;
  const briefing = value as Record<string, unknown>;
  if (!Array.isArray(briefing.sources) || !briefing.sources.every(isSource)) return false;
  const sourceIds = new Set(briefing.sources.map((source) => (source as DailyBriefingSource).id));
  return sourceIds.size === briefing.sources.length &&
    briefing.schema_version === "daily-briefing.v2" &&
    nonEmpty(briefing.fact_sheet_id) &&
    typeof briefing.date === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(briefing.date) &&
    nonEmpty(briefing.generated_at) &&
    nonEmpty(briefing.market_data_cutoff) &&
    briefing.theme_id === themeId && THEME_IDS.has(briefing.theme_id as ThemeId) &&
    nonEmpty(briefing.title) && nonEmpty(briefing.dek) &&
    Array.isArray(briefing.market) && briefing.market.every((item) => isMarketItem(item, sourceIds)) &&
    Array.isArray(briefing.news) && briefing.news.every((item) => isNewsItem(item, sourceIds)) &&
    Array.isArray(briefing.sections) && briefing.sections.length >= 2 && briefing.sections.every(isSection) &&
    nonEmpty(briefing.notice);
}

export async function loadDailyBriefing(
  themeId: ThemeId,
  signal?: AbortSignal,
  now: Date = new Date(),
): Promise<DailyBriefing> {
  try {
    const cacheDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const response = await fetch(`/daily-briefings/latest/${themeId}.json?date=${cacheDate}`, {
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return { ...FALLBACK_DAILY_BRIEFING, theme_id: themeId };
    const value: unknown = await response.json();
    return isDailyBriefing(value, themeId)
      ? value
      : { ...FALLBACK_DAILY_BRIEFING, theme_id: themeId };
  } catch {
    return { ...FALLBACK_DAILY_BRIEFING, theme_id: themeId };
  }
}
