import type { ThemeId } from "../theme/catalog.js";

export const DAILY_BRIEFING_THEME_IDS = [
  "eastern_observation",
  "jixing_doudou",
  "sunge",
  "zhouli",
  "tieba_laoge",
  "male_succubus",
  "female_succubus",
] as const satisfies readonly ThemeId[];

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
  related_assets: string[];
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
  market: DailyBriefingMarketItem[];
  news: DailyBriefingNewsItem[];
  sections: DailyBriefingSection[];
  sources: DailyBriefingSource[];
  notice: string;
}

export interface GeneratedThemeCopy {
  schema_version: "daily-briefing.v2";
  title: string;
  dek: string;
  sections: DailyBriefingSection[];
}

export function sharedFacts(value: DailyBriefing): string {
  return JSON.stringify({
    fact_sheet_id: value.fact_sheet_id,
    date: value.date,
    market_data_cutoff: value.market_data_cutoff,
    market: value.market,
    news: value.news,
    sources: value.sources,
  });
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isGeneratedThemeCopy(value: unknown): value is GeneratedThemeCopy {
  if (!value || typeof value !== "object") return false;
  const copy = value as Record<string, unknown>;
  const modelText = [copy.title, copy.dek, ...(Array.isArray(copy.sections) ? copy.sections.flatMap((item) =>
    item && typeof item === "object"
      ? [(item as Record<string, unknown>).heading, (item as Record<string, unknown>).body]
      : []) : [])];
  return copy.schema_version === "daily-briefing.v2" && nonEmpty(copy.title) &&
    nonEmpty(copy.dek) && Array.isArray(copy.sections) && copy.sections.length >= 2 &&
    copy.sections.every((item) => item && typeof item === "object" &&
      nonEmpty((item as Record<string, unknown>).heading) &&
      nonEmpty((item as Record<string, unknown>).body)) &&
    modelText.every((text) => typeof text === "string" && !/\d/u.test(text));
}

export function validateDailyBriefing(value: unknown, expectedDate: string, expectedTheme: ThemeId): asserts value is DailyBriefing {
  if (!value || typeof value !== "object") throw new Error("root must be an object");
  const briefing = value as Record<string, unknown>;
  if (briefing.schema_version !== "daily-briefing.v2") throw new Error("invalid schema_version");
  if (briefing.date !== expectedDate) throw new Error(`date must equal ${expectedDate}`);
  if (briefing.theme_id !== expectedTheme) throw new Error(`theme_id must equal ${expectedTheme}`);
  for (const key of ["fact_sheet_id", "generated_at", "market_data_cutoff", "title", "dek", "notice"]) {
    if (!nonEmpty(briefing[key])) throw new Error(`${key} is required`);
  }
  if (!Array.isArray(briefing.market) || !Array.isArray(briefing.news) || !Array.isArray(briefing.sources)) {
    throw new Error("market, news and sources arrays are required");
  }
  if (!Array.isArray(briefing.sections) || briefing.sections.length < 2 ||
      !briefing.sections.every((item) => item && typeof item === "object" &&
        nonEmpty((item as Record<string, unknown>).heading) && nonEmpty((item as Record<string, unknown>).body))) {
    throw new Error("at least two valid sections are required");
  }
  const generatedAtMs = Date.parse(briefing.generated_at as string);
  if (!Number.isFinite(generatedAtMs)) throw new Error("generated_at must be a valid timestamp");
  const sourceIds = new Set<string>();
  for (const source of briefing.sources) {
    if (!source || typeof source !== "object") throw new Error("invalid source");
    const item = source as Record<string, unknown>;
    if (!nonEmpty(item.id) || !nonEmpty(item.name) || !nonEmpty(item.url)) throw new Error("invalid source");
    const url = new URL(item.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("source URL must be HTTP(S)");
    if (sourceIds.has(item.id)) throw new Error(`duplicate source id: ${item.id}`);
    sourceIds.add(item.id);
  }
  for (const market of briefing.market) {
    if (!market || typeof market !== "object") throw new Error("invalid market item");
    const item = market as Record<string, unknown>;
    if (!nonEmpty(item.label) || !nonEmpty(item.value) || !nonEmpty(item.observed_at) ||
        !nonEmpty(item.source_id) || !sourceIds.has(item.source_id)) throw new Error("invalid market item or source reference");
  }
  for (const news of briefing.news) {
    if (!news || typeof news !== "object") throw new Error("invalid news item");
    const item = news as Record<string, unknown>;
    const publishedAtMs = typeof item.published_at === "string" ? Date.parse(item.published_at) : Number.NaN;
    if (!nonEmpty(item.title) || !nonEmpty(item.summary) || !nonEmpty(item.published_at) ||
        !Number.isFinite(publishedAtMs) || publishedAtMs > generatedAtMs ||
        !nonEmpty(item.source_id) || !sourceIds.has(item.source_id) ||
        !["high", "medium"].includes(item.importance as string) ||
        !Array.isArray(item.related_assets) || !item.related_assets.every(nonEmpty)) {
      throw new Error("invalid news item or source reference");
    }
  }
  if (typeof briefing.notice !== "string" || !briefing.notice.includes("不构成个性化投资建议")) {
    throw new Error("notice must preserve the non-advice boundary");
  }
}
