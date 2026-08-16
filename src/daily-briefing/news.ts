import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import type { DailyBriefingNewsItem, DailyBriefingSource } from "./contracts.js";
import { hasPrivatePayload } from "../model/privacy.js";

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_BYTES = 2_000_000;
const LOOKBACK_MS = 48 * 60 * 60 * 1_000;
const MAX_NEWS_ITEMS = 4;

const ALLOWED_HOSTS = new Set(["finance.eastmoney.com", "news.10jqka.com.cn"]);
const TITLE_RELEVANCE = /央行|人民银行|证监会|金融监管|财政|统计局|发改委|CPI|PPI|PMI|GDP|LPR|逆回购|国债|货币政策|财政政策|A股|沪指|上证|深证|创业板|科创板|ETF|成交|北向|港股|恒生|论市/iu;
const SUMMARY_RELEVANCE = /央行|人民银行|证监会|金融监管|财政部|统计局|发改委|CPI|PPI|PMI|GDP|LPR|逆回购|货币政策|财政政策|A股|沪指|上证指数|深证成指|创业板指|ETF.{0,12}(?:资金|规模|净流入|净流出)|成交额|北向资金|港股|恒生指数/iu;
const MARKET_CONTEXT = /中国|国内|我国|央行|人民银行|证监会|金融监管|财政部|统计局|发改委|A股|沪指|上证|深证|创业板|科创板|ETF|北向|港股|恒生|LPR|逆回购|美联储|美国.{0,6}(?:CPI|PPI|非农|通胀|利率)|欧洲央行/iu;
const HIGH_IMPORTANCE = /央行|人民银行|证监会|金融监管|财政部|统计局|发改委|CPI|PPI|PMI|GDP|LPR|逆回购|货币政策|财政政策/iu;

type WorkerNewsItem = {
  provider: "eastmoney" | "10jqka";
  title: string;
  summary: string;
  publishedAt: string;
  url: string;
};

type NewsBundle = { news: DailyBriefingNewsItem[]; sources: DailyBriefingSource[] };

function cleanText(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/gu, " ").trim();
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseShanghaiTimestamp(value: string): Date | undefined {
  const normalized = value.trim().replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(normalized) ? normalized : `${normalized}+08:00`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizedTitle(value: string): string {
  return value.toLocaleLowerCase("zh-CN")
    .replace(/[\s【】（）()“”"'：:，,。.!！?？、\-—]/gu, "")
    .replaceAll("[", "")
    .replaceAll("]", "");
}

function relatedAssets(text: string): string[] {
  const values: string[] = [];
  if (/A股|沪指|上证|深证|创业板|科创板|ETF|成交|北向/iu.test(text)) values.push("A股");
  if (/港股|恒生/iu.test(text)) values.push("港股");
  if (/中国|国内|我国|央行|人民银行|财政部|统计局|发改委|LPR|逆回购|货币政策|财政政策/iu.test(text)) values.push("中国宏观");
  if (/美联储|美国.{0,6}(?:CPI|PPI|非农|通胀|利率)|欧洲央行/iu.test(text)) values.push("全球宏观");
  return values.length > 0 ? values : ["公开市场"];
}

function validWorkerItem(value: unknown): value is WorkerNewsItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WorkerNewsItem>;
  return (item.provider === "eastmoney" || item.provider === "10jqka") &&
    typeof item.title === "string" && typeof item.summary === "string" &&
    typeof item.publishedAt === "string" && typeof item.url === "string";
}

export function normalizeDailyNews(value: unknown, asOf: Date): NewsBundle {
  const payload = value && typeof value === "object" ? value as { status?: unknown; results?: unknown } : {};
  if (payload.status !== "completed" || !Array.isArray(payload.results)) return { news: [], sources: [] };
  const earliest = asOf.getTime() - LOOKBACK_MS;
  const seenTitles = new Set<string>();
  const seenUrls = new Set<string>();
  const accepted: Array<WorkerNewsItem & { published: Date }> = [];

  for (const candidate of payload.results) {
    if (!validWorkerItem(candidate)) continue;
    const title = cleanText(candidate.title, 180);
    const summary = cleanText(candidate.summary, 420);
    const published = parseShanghaiTimestamp(candidate.publishedAt);
    let url: URL;
    try { url = new URL(candidate.url); } catch { continue; }
    const titleKey = normalizedTitle(title);
    if (!title || !summary || !published || published.getTime() > asOf.getTime() || published.getTime() < earliest ||
        url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname) ||
        (!TITLE_RELEVANCE.test(title) && !SUMMARY_RELEVANCE.test(summary)) ||
        !MARKET_CONTEXT.test(`${title} ${summary}`) || hasPrivatePayload({ title, summary }) ||
        seenTitles.has(titleKey) || seenUrls.has(url.href)) continue;
    seenTitles.add(titleKey);
    seenUrls.add(url.href);
    accepted.push({ ...candidate, title, summary, url: url.href, published });
  }

  accepted.sort((left, right) => right.published.getTime() - left.published.getTime() ||
    (left.provider === "eastmoney" ? -1 : 1));
  const selected = accepted.slice(0, MAX_NEWS_ITEMS);
  const sources: DailyBriefingSource[] = [];
  const news: DailyBriefingNewsItem[] = selected.map((item) => {
    const id = `news-${createHash("sha256").update(item.url).digest("hex").slice(0, 16)}`;
    sources.push({
      id,
      name: item.provider === "eastmoney" ? "东方财富财经" : "同花顺财经",
      url: item.url,
    });
    const text = `${item.title} ${item.summary}`;
    return {
      title: item.title,
      summary: item.summary,
      published_at: item.published.toISOString(),
      source_id: id,
      importance: HIGH_IMPORTANCE.test(text) ? "high" : "medium",
      related_assets: relatedAssets(text),
    };
  });
  return { news, sources };
}

export interface AkshareDailyNewsOptions {
  pythonExecutable?: string;
  workerPath?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal: AbortSignal;
  asOf: Date;
}

export async function collectAkshareDailyNews(options: AkshareDailyNewsOptions): Promise<NewsBundle> {
  const pythonExecutable = options.pythonExecutable ?? options.env?.AKSHARE_PYTHON_EXECUTABLE ??
    process.env.AKSHARE_PYTHON_EXECUTABLE ?? "/home/evil/.local/share/mandune-dev/akshare-venv/bin/python";
  const workerPath = options.workerPath ?? fileURLToPath(new URL("../providers/akshare-worker.py", import.meta.url));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (options.signal.aborted) return { news: [], sources: [] };

  return new Promise((resolve) => {
    const child = spawn(pythonExecutable, [workerPath], {
      env: { ...(options.env ?? process.env), PYTHONUNBUFFERED: "1" },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let stdout = "";
    let settled = false;
    const finish = (bundle: NewsBundle) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal.removeEventListener("abort", abort);
      resolve(bundle);
    };
    const abort = () => { child.kill("SIGTERM"); finish({ news: [], sources: [] }); };
    const timer = setTimeout(abort, timeoutMs);
    child.on("error", () => finish({ news: [], sources: [] }));
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) abort();
    });
    child.on("close", () => {
      if (settled) return;
      try { finish(normalizeDailyNews(JSON.parse(stdout), options.asOf)); }
      catch { finish({ news: [], sources: [] }); }
    });
    options.signal.addEventListener("abort", abort, { once: true });
    child.stdin.end(JSON.stringify({ operation: "daily_news" }));
  });
}

export type DailyNewsCollector = (input: { asOf: Date; signal: AbortSignal; env: NodeJS.ProcessEnv }) => Promise<NewsBundle>;
