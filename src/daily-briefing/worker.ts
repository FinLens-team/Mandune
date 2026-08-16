import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { DAILY_BRIEFING_THEME_IDS, isGeneratedThemeCopy, sharedFacts, validateDailyBriefing, type DailyBriefing, type DailyBriefingMarketItem, type DailyBriefingNewsItem, type DailyBriefingSource, type GeneratedThemeCopy } from "./contracts.js";
import { collectAkshareDailyNews, type DailyNewsCollector } from "./news.js";
import { loadServerConfig } from "../server/config.js";
import { createAnthropicMessagesModelGateway, createFallbackModelGateway, createOpenAICompatibleModelGateway, type ModelGateway } from "../model/index.js";

const SCHEMA_VERSION = "daily-briefing.v2";
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;
const INDEXES = [
  { code: "sh000001", label: "上证指数", sourceId: "tencent-sh000001" },
  { code: "sz399001", label: "深证成指", sourceId: "tencent-sz399001" },
  { code: "sz399006", label: "创业板指", sourceId: "tencent-sz399006" },
] as const;

type FetchLike = typeof fetch;

interface DailyBriefingGeneration {
  schema_version: typeof SCHEMA_VERSION;
  themes: Record<(typeof DAILY_BRIEFING_THEME_IDS)[number], GeneratedThemeCopy>;
}

function dateInShanghai(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function isoInShanghai(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error(`invalid date: ${value}`);
}

async function fetchIndex(code: string, fetchImpl: FetchLike, signal: AbortSignal): Promise<{ date: string; close: number; previousClose?: number }> {
  const endpoint = new URL("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get");
  endpoint.searchParams.set("param", `${code},day,,,30,qfq`);
  const response = await fetchImpl(endpoint, { signal });
  if (!response.ok) throw new Error(`market upstream HTTP ${response.status}`);
  const body = await response.json() as { data?: Record<string, { day?: unknown }>; };
  const rows = body.data?.[code]?.day;
  if (!Array.isArray(rows)) throw new Error(`market upstream returned no rows for ${code}`);
  const parsed = rows.flatMap((row) => {
    if (!Array.isArray(row) || typeof row[0] !== "string") return [];
    const close = Number(row[2]);
    return /^\d{4}-\d{2}-\d{2}$/u.test(row[0]) && Number.isFinite(close) && close > 0
      ? [{ date: row[0], close }] : [];
  });
  if (parsed.length === 0) throw new Error(`market upstream returned no valid rows for ${code}`);
  const latest = parsed.at(-1)!;
  const previous = parsed.at(-2)?.close;
  return { date: latest.date, close: latest.close, ...(previous ? { previousClose: previous } : {}) };
}

async function collectMarket(fetchImpl: FetchLike, signal: AbortSignal): Promise<{ cutoff: string; market: DailyBriefingMarketItem[] }> {
  const rows = await Promise.all(INDEXES.map((item) => fetchIndex(item.code, fetchImpl, signal)));
  const cutoff = rows.map((row) => row.date).sort().at(-1)!;
  return {
    cutoff,
    market: rows.map((row, index) => ({
      label: INDEXES[index]!.label,
      value: row.close.toFixed(2),
      ...(row.previousClose ? { change: `${((row.close / row.previousClose - 1) * 100).toFixed(2)}%` } : {}),
      observed_at: `${row.date} 15:00`,
      source_id: INDEXES[index]!.sourceId,
    })),
  };
}

function buildGateway(env: NodeJS.ProcessEnv): ModelGateway | undefined {
  const config = loadServerConfig(env);
  if (!config.model) return undefined;
  const build = (model: NonNullable<typeof config.model>): ModelGateway => model.protocol === "anthropic_messages"
    ? createAnthropicMessagesModelGateway({ providerName: model.providerName, baseURL: model.baseURL, apiKey: model.apiKey, modelId: model.modelId })
    : createOpenAICompatibleModelGateway({ providerName: model.providerName, baseURL: model.baseURL, apiKey: model.apiKey, modelId: model.modelId, supportsStructuredOutputs: model.supportsStructuredOutputs });
  return createFallbackModelGateway([build(config.model), ...config.modelFallbacks.map(build)]);
}

function generationSchema(): Record<string, unknown> {
  const copy = {
    type: "object", additionalProperties: false,
    properties: {
      schema_version: { type: "string", const: SCHEMA_VERSION },
      title: { type: "string" }, dek: { type: "string" },
      sections: { type: "array", minItems: 2, items: { type: "object", additionalProperties: false, properties: { heading: { type: "string" }, body: { type: "string" } }, required: ["heading", "body"] } },
    }, required: ["schema_version", "title", "dek", "sections"],
  };
  return { type: "object", additionalProperties: false, properties: {
    schema_version: { type: "string", const: SCHEMA_VERSION },
    themes: { type: "object", additionalProperties: false, properties: Object.fromEntries(DAILY_BRIEFING_THEME_IDS.map((id) => [id, copy])), required: [...DAILY_BRIEFING_THEME_IDS] },
  }, required: ["schema_version", "themes"] };
}

async function generateCopies(gateway: ModelGateway, input: { date: string; cutoff: string; market: DailyBriefingMarketItem[]; news: DailyBriefingNewsItem[]; sources: DailyBriefingSource[] }, signal: AbortSignal): Promise<DailyBriefingGeneration> {
  const instructions = [
    "你是 Mandune 的每日市场日报编辑。只基于输入中的已核验公开行情和新闻写作，不得编造新闻、数字、原因或预测。",
    "返回一个 JSON 对象，必须严格符合 schema；每个主题只改变标题、导语和 sections，不能改变事实。",
    "market/news/source 由程序填写，不要在 themes 中重复或改写它们；news 为空时明确没有纳入可核验新闻，非空时只解释所给条目。",
    "标题、导语和段落中禁止使用任何阿拉伯数字；精确数字只由程序写入 market 字段，避免模型改写或编造数字。",
    "必须保留风险边界：不构成个性化投资建议，不给买卖时点、目标价、精确交易动作或收益保证。",
    "贴吧老哥可以有粗粝吐槽但不得群体羞辱；魅魔主题保持暧昧但不得露骨成人内容。",
  ].join("\n");
  const request = {
    operation: "daily_briefing_theme_copies",
    schemaVersion: SCHEMA_VERSION,
    schema: generationSchema(),
    instructions,
    input: {
      date: input.date,
      market_data_cutoff: input.cutoff,
      market: input.market,
      news: input.news,
      sources: input.sources.map(({ id, name }) => ({ id, name })),
    },
    signal,
    timeoutMs: REQUEST_TIMEOUT_MS,
    temperature: 0.2,
    maxOutputTokens: 6_000,
  };
  let last = "model generation failed";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await gateway.generate<DailyBriefingGeneration>(request);
    if (result.ok && result.value.schema_version === SCHEMA_VERSION && DAILY_BRIEFING_THEME_IDS.every((id) => isGeneratedThemeCopy(result.value.themes?.[id]))) return result.value;
    last = result.ok ? "model output failed daily briefing schema validation" : result.code;
    if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
  }
  throw new Error(last);
}

async function acquireLock(lockPath: string): Promise<() => Promise<void>> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n`);
      return async () => { await handle.close(); await rm(lockPath, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = Number.parseInt(await readFile(lockPath, "utf8").catch(() => ""), 10);
      let alive = Number.isInteger(owner) && owner > 0;
      if (alive) {
        try { process.kill(owner, 0); } catch (probeError) {
          alive = (probeError as NodeJS.ErrnoException).code === "EPERM";
        }
      }
      if (alive || attempt > 0) throw new Error(`daily briefing already running (${lockPath})`);
      await rm(lockPath, { force: true });
    }
  }
  throw new Error(`failed to acquire daily briefing lock (${lockPath})`);
}

async function readExisting(root: string, date: string): Promise<DailyBriefing[] | undefined> {
  const directory = path.join(root, date);
  try {
    const values = await Promise.all(DAILY_BRIEFING_THEME_IDS.map(async (theme) => {
      const value = JSON.parse(await readFile(path.join(directory, `${theme}.json`), "utf8")) as unknown;
      validateDailyBriefing(value, date, theme);
      return value;
    }));
    const facts = sharedFacts(values[0]!);
    if (!values.every((value) => sharedFacts(value) === facts)) throw new Error("existing daily briefing facts differ");
    return values;
  } catch {
    return undefined;
  }
}

async function writeDateDirectory(root: string, date: string, values: readonly DailyBriefing[]): Promise<void> {
  const staging = path.join(root, `.run-${date}-${process.pid}`);
  const destination = path.join(root, date);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    await Promise.all(values.map((value) => writeFile(path.join(staging, `${value.theme_id}.json`), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })));
    const previous = `${destination}.previous-${process.pid}`;
    await rm(previous, { recursive: true, force: true });
    try { await rename(destination, previous); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await rename(staging, destination); } catch (error) {
      try { await rename(previous, destination); } catch (restoreError) {
        throw new AggregateError([error, restoreError], "failed to restore previous daily briefing");
      }
      throw error;
    }
    await rm(previous, { recursive: true, force: true });
  } finally { await rm(staging, { recursive: true, force: true }); }
}

async function publish(root: string, date: string): Promise<void> {
  const sourceDir = path.join(root, date);
  const latestDir = path.join(root, "latest");
  const stagingDir = path.join(root, `.latest-${process.pid}`);
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
  try {
    let expectedFacts: string | undefined;
    for (const themeId of DAILY_BRIEFING_THEME_IDS) {
      const value = JSON.parse(await readFile(path.join(sourceDir, `${themeId}.json`), "utf8")) as unknown;
      validateDailyBriefing(value, date, themeId);
      const facts = sharedFacts(value);
      if (expectedFacts === undefined) expectedFacts = facts;
      else if (facts !== expectedFacts) throw new Error(`${themeId} does not share the reviewed fact sheet`);
      await writeFile(path.join(stagingDir, `${themeId}.json`), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    }
    const previous = `${latestDir}.previous-${process.pid}`;
    await rm(previous, { recursive: true, force: true });
    let hadLatest = true;
    try {
      await rename(latestDir, previous);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hadLatest = false;
    }
    try {
      await rename(stagingDir, latestDir);
      if (hadLatest) await rm(previous, { recursive: true, force: true });
    } catch (error) {
      if (hadLatest) await rename(previous, latestDir);
      throw error;
    }
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

export async function runDailyBriefing(options: { date?: string; root?: string; force?: boolean; fetchImpl?: FetchLike; env?: NodeJS.ProcessEnv; gateway?: ModelGateway; newsCollector?: DailyNewsCollector; now?: () => Date } = {}): Promise<{ date: string; cutoff: string; reused: boolean; newsCount: number }> {
  const env = options.env ?? process.env;
  const config = loadServerConfig(env);
  const date = options.date ?? dateInShanghai();
  assertDate(date);
  const root = options.root ?? config.dailyBriefingsDirectory;
  await mkdir(root, { recursive: true });
  const release = await acquireLock(path.join(root, ".lock"));
  try {
    const existing = options.force ? undefined : await readExisting(root, date);
    if (existing) {
      await publish(root, date);
      return { date, cutoff: existing[0]!.market_data_cutoff, reused: true, newsCount: existing[0]!.news.length };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150_000);
    try {
      const market = await collectMarket(options.fetchImpl ?? fetch, controller.signal);
      const generatedAtDate = options.now?.() ?? new Date();
      const generatedAt = isoInShanghai(generatedAtDate);
      const currentShanghaiDate = dateInShanghai(generatedAtDate);
      const newsAsOf = date === currentShanghaiDate ? generatedAtDate : new Date(`${date}T23:59:59+08:00`);
      const collectNews = options.newsCollector ?? ((input) => collectAkshareDailyNews({ ...input }));
      let newsBundle: { news: DailyBriefingNewsItem[]; sources: DailyBriefingSource[] } = { news: [], sources: [] };
      try {
        newsBundle = await collectNews({ asOf: newsAsOf, signal: controller.signal, env });
      } catch {
        newsBundle = { news: [], sources: [] };
      }
      const marketSources = INDEXES.map((item) => ({ id: item.sourceId, name: `腾讯行情日K（${item.label}）`, url: `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${item.code},day,,,30,qfq` }));
      const sources = [...marketSources, ...newsBundle.sources];
      const gateway = options.gateway ?? buildGateway(env);
      if (!gateway) throw new Error("model gateway is not configured");
      const copies = await generateCopies(gateway, {
        date, cutoff: market.cutoff, market: market.market, news: newsBundle.news, sources,
      }, controller.signal);
      const cutoff = `${market.cutoff} 15:00（最近一个已完成 A 股交易日；截至 ${generatedAt}）`;
      const values = DAILY_BRIEFING_THEME_IDS.map((themeId) => ({
        schema_version: SCHEMA_VERSION, fact_sheet_id: `cn-market-${date}-r2`, date, generated_at: generatedAt,
        market_data_cutoff: cutoff, theme_id: themeId, title: copies.themes[themeId]!.title, dek: copies.themes[themeId]!.dek,
        market: market.market, news: newsBundle.news, sections: copies.themes[themeId]!.sections, sources,
        notice: "日报基于公开市场信息预先生成，不使用你的持仓数据，也不构成个性化投资建议。",
      } satisfies DailyBriefing));
      for (const value of values) validateDailyBriefing(value, date, value.theme_id);
      if (!values.every((value) => sharedFacts(value) === sharedFacts(values[0]!))) throw new Error("generated themes do not share facts");
      await writeDateDirectory(root, date, values);
      await publish(root, date);
      return { date, cutoff, reused: false, newsCount: newsBundle.news.length };
    } finally { clearTimeout(timer); }
  } finally { await release(); }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const dateArg = process.argv.slice(2).find((arg) => /^\d{4}-\d{2}-\d{2}$/u.test(arg));
  const result = await runDailyBriefing({ ...(dateArg ? { date: dateArg } : {}), force: args.has("--force") });
  process.stdout.write(`Mandune daily briefing ${result.reused ? "reused" : "generated and published"}: ${result.date}; ${DAILY_BRIEFING_THEME_IDS.length} themes; ${result.newsCount} verified news items; ${result.cutoff}\n`);
}

const entryPoint = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entryPoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`Daily briefing failed: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
