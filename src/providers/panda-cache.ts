import type { EvidenceRecord, PortfolioSnapshot } from "../contracts/index.js";
import type {
  MarketObservationCacheRecord,
} from "../persistence/evidence-cache-store.js";
import type {
  PandaBatchClient,
  PandaBatchRequest,
  PandaBatchResult,
  PandaBatchRow,
} from "./panda-batch.js";

const CACHE_METHOD = "market_series";
const FAILURE_TTL_MS = 5 * 60 * 1_000;
const CALENDAR_LOOKBACK_MS = 10 * 24 * 60 * 60 * 1_000;
const REQUIRED_TRADING_DAYS = 3;

export interface PandaMarketCache {
  getMarket(input: {
    provider: string;
    method: string;
    assetClass: PandaBatchRequest["assetClass"];
    symbol: string;
    tradingDay: string;
  }): MarketObservationCacheRecord | null;
  putMarket(record: MarketObservationCacheRecord): void;
}

export interface CachedPandaEvidenceResult {
  evidence: EvidenceRecord[];
  failures: { lineId: string; status: PandaBatchResult["status"]; errorCode?: string }[];
}

interface CachedPayload {
  method: string | null;
  rows: PandaBatchRow[];
}

interface CollectedResult {
  result: PandaBatchResult;
  fetchedAt: string;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function cachedPayload(value: unknown): value is CachedPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Partial<CachedPayload>;
  return (payload.method === null || typeof payload.method === "string") &&
    Array.isArray(payload.rows) && payload.rows.every((row) =>
      typeof row === "object" && row !== null && isIsoDate(row.date) &&
      typeof row.metric === "string" && row.metric.length > 0 &&
      typeof row.value === "number" && Number.isFinite(row.value));
}

function cacheFresh(record: MarketObservationCacheRecord, tradingDay: string, now: Date): boolean {
  const fetched = Date.parse(record.fetchedAt);
  if (!Number.isFinite(fetched)) return false;
  if (record.status === "failed") return fetched + FAILURE_TTL_MS > now.getTime();
  const ageDays = Math.floor((now.getTime() - Date.parse(`${tradingDay}T00:00:00.000Z`)) / 86_400_000);
  if (ageDays > 3) return true;
  return new Date(fetched).toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

function startDate(tradingDay: string): string {
  return new Date(Date.parse(`${tradingDay}T00:00:00.000Z`) - CALENDAR_LOOKBACK_MS)
    .toISOString().slice(0, 10);
}

function statusFor(result: PandaBatchResult): EvidenceRecord["status"] {
  if (result.status === "unsupported") return "unsupported";
  if (result.status === "empty") return "ambiguous";
  return "failed";
}

function latestRows(rows: readonly PandaBatchRow[], tradingDay: string): PandaBatchRow[] {
  const byMetricAndDate = new Map<string, PandaBatchRow>();
  for (const row of rows) {
    if (row.date <= tradingDay) byMetricAndDate.set(`${row.metric}:${row.date}`, row);
  }
  return [...byMetricAndDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-REQUIRED_TRADING_DAYS);
}

function unavailableEvidence(
  line: PortfolioSnapshot["lines"][number],
  result: PandaBatchResult,
  tradingDay: string,
  fetchedAt: string,
): EvidenceRecord {
  return {
    id: `panda-market-${line.line_id}-${tradingDay}`,
    scope: { kind: "asset", line_id: line.line_id, symbol: line.symbol },
    metric_or_event_type: line.asset_class === "fund" ? "nav" : "close",
    value: null,
    source: {
      name: "PandaAI",
      locator: `pandaai:${result.method ?? CACHE_METHOD}:${line.symbol}`,
    },
    observation_or_event_time: tradingDay,
    fetched_at: fetchedAt,
    status: statusFor(result),
    limitations: [
      result.status === "unsupported"
        ? "PandaAI 当前 SDK 或权限不支持该资产的市场序列。"
        : result.status === "empty"
          ? "PandaAI 没有返回可用于当前完整交易日的市场序列。"
          : "PandaAI 市场序列请求失败，未产生当前值。",
    ],
    provenance: "observed",
  };
}

function rowEvidence(
  line: PortfolioSnapshot["lines"][number],
  result: PandaBatchResult,
  row: PandaBatchRow,
  fetchedAt: string,
): EvidenceRecord {
  return {
    id: `panda-market-${line.line_id}-${row.metric}-${row.date}`,
    scope: { kind: "asset", line_id: line.line_id, symbol: line.symbol },
    metric_or_event_type: row.metric,
    value: row.value,
    normalization_note: "unitless_return_eligible:same_provider_method",
    source: {
      name: `PandaAI ${result.method ?? CACHE_METHOD}`,
      locator: `pandaai:${result.method ?? CACHE_METHOD}:${line.symbol}:${row.date}`,
    },
    observation_or_event_time: row.date,
    fetched_at: fetchedAt,
    status: "ambiguous",
    limitations: [
      "供应商运行证据尚未确认该数值的价格或净值单位，原始值不直接支持物质性结论。",
      "同一供应商方法的连续观察值可以用于派生不依赖币种单位的涨跌幅。",
    ],
    provenance: "observed",
  };
}

function resultFromCache(line: PortfolioSnapshot["lines"][number], record: MarketObservationCacheRecord): PandaBatchResult | undefined {
  if (!cachedPayload(record.payload)) return undefined;
  const status = record.status;
  if (status !== "available" && status !== "empty" && status !== "unsupported" && status !== "failed") return undefined;
  return {
    lineId: line.line_id,
    assetClass: line.asset_class,
    symbol: line.symbol,
    status,
    method: record.payload.method,
    rows: record.payload.rows,
    ...(record.lastErrorCode ? { errorCode: record.lastErrorCode } : {}),
  };
}

export class CachedPandaEvidenceCollector {
  private readonly batches = new Map<string, Promise<CachedPandaEvidenceResult>>();

  constructor(
    private readonly client: Pick<PandaBatchClient, "collect">,
    private readonly cache: PandaMarketCache,
    private readonly now: () => Date = () => new Date(),
  ) {}

  collect(input: {
    snapshot: PortfolioSnapshot;
    tradingDay: string;
    signal: AbortSignal;
  }): Promise<CachedPandaEvidenceResult> {
    const key = `${input.tradingDay}:${input.snapshot.lines
      .map((line) => `${line.line_id}:${line.asset_class}:${line.symbol}`)
      .sort().join("|")}`;
    const existing = this.batches.get(key);
    if (existing) return existing;
    const task = this.collectBatch(input).finally(() => this.batches.delete(key));
    this.batches.set(key, task);
    return task;
  }

  private async collectBatch(input: {
    snapshot: PortfolioSnapshot;
    tradingDay: string;
    signal: AbortSignal;
  }): Promise<CachedPandaEvidenceResult> {
    const current = this.now();
    const fetchedAt = current.toISOString();
    const results = new Map<string, CollectedResult>();
    const missing: PortfolioSnapshot["lines"] = [];

    for (const line of input.snapshot.lines) {
      const record = this.cache.getMarket({
        provider: "pandaai",
        method: CACHE_METHOD,
        assetClass: line.asset_class,
        symbol: line.symbol,
        tradingDay: input.tradingDay,
      });
      const cached = record && cacheFresh(record, input.tradingDay, current)
        ? resultFromCache(line, record)
        : undefined;
      if (cached && record) {
        results.set(line.line_id, {
          result: { ...cached, rows: latestRows(cached.rows, input.tradingDay) },
          fetchedAt: record.fetchedAt,
        });
      }
      else missing.push(line);
    }

    if (missing.length > 0) {
      let fetched: PandaBatchResult[];
      try {
        fetched = await this.client.collect(missing.map((line) => ({
          lineId: line.line_id,
          assetClass: line.asset_class,
          symbol: line.symbol,
          startDate: startDate(input.tradingDay),
          endDate: input.tradingDay,
        })), input.signal);
      } catch (error) {
        if (input.signal.aborted) throw error;
        fetched = missing.map((line) => ({
          lineId: line.line_id,
          assetClass: line.asset_class,
          symbol: line.symbol,
          status: "failed",
          method: null,
          rows: [],
          errorCode: "batch_failed",
        }));
      }
      const fetchedByLine = new Map(fetched.map((item) => [item.lineId, item]));
      for (const line of missing) {
        const rawResult = fetchedByLine.get(line.line_id) ?? {
          lineId: line.line_id,
          assetClass: line.asset_class,
          symbol: line.symbol,
          status: "failed" as const,
          method: null,
          rows: [],
          errorCode: "missing_batch_result",
        };
        const result = { ...rawResult, rows: latestRows(rawResult.rows, input.tradingDay) };
        results.set(line.line_id, { result, fetchedAt });
        const observedAt = result.rows.at(-1)?.date;
        this.cache.putMarket({
          provider: "pandaai",
          method: CACHE_METHOD,
          assetClass: line.asset_class,
          symbol: line.symbol,
          tradingDay: input.tradingDay,
          status: result.status,
          payload: { method: result.method, rows: result.rows },
          ...(observedAt ? { observedAt } : {}),
          fetchedAt,
          ...(result.errorCode ? { lastErrorCode: result.errorCode } : {}),
        });
      }
    }

    const evidence: EvidenceRecord[] = [];
    const failures: CachedPandaEvidenceResult["failures"] = [];
    for (const line of input.snapshot.lines) {
      const collected = results.get(line.line_id)!;
      const { result } = collected;
      if (result.status === "available" && result.rows.length > 0) {
        evidence.push(...result.rows.map((row) => rowEvidence(line, result, row, collected.fetchedAt)));
        if (result.rows.length < REQUIRED_TRADING_DAYS) {
          failures.push({ lineId: line.line_id, status: "empty", errorCode: "insufficient_history" });
        }
      } else {
        evidence.push(unavailableEvidence(line, result, input.tradingDay, collected.fetchedAt));
        failures.push({
          lineId: line.line_id,
          status: result.status,
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        });
      }
    }
    return { evidence, failures };
  }
}
