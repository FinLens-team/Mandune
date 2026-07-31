import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { EvidenceRecord } from "../contracts/index.js";
import type { MarketEvidenceSource } from "../analysis/index.js";

type WorkerRow = { date: string; close: number };
type WorkerResult = {
  lineId: string;
  assetClass: "fund" | "etf" | "a_share";
  symbol: string;
  status: "available" | "empty" | "unsupported" | "failed";
  method: string | null;
  rows: WorkerRow[];
  errorCode?: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 4_000_000;
const MARKET_LOOKBACK_CALENDAR_DAYS = 370;

function evidenceId(lineId: string, date: string): string {
  return `akshare-market-${lineId}-${date}`;
}

function validRow(value: unknown): value is WorkerRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<WorkerRow>;
  return typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    typeof row.close === "number" && Number.isFinite(row.close) && row.close > 0;
}

function validResult(value: unknown): value is WorkerResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<WorkerResult>;
  return typeof result.lineId === "string" && typeof result.symbol === "string" &&
    (result.status === "available" || result.status === "empty" ||
      result.status === "unsupported" || result.status === "failed") &&
    (result.method === null || typeof result.method === "string") &&
    Array.isArray(result.rows) && result.rows.every(validRow);
}

function metricFor(assetClass: WorkerResult["assetClass"]): "nav" | "close" {
  return assetClass === "fund" ? "nav" : "close";
}

function unitFor(assetClass: WorkerResult["assetClass"]): "CNY_per_share" | "CNY" {
  return assetClass === "fund" ? "CNY_per_share" : "CNY";
}

function failedEvidence(input: Parameters<MarketEvidenceSource["collectMarketEvidence"]>[0], limitation: string): EvidenceRecord {
  return {
    id: evidenceId(input.lineId, input.latestCompleteTradingDay),
    scope: { kind: "asset", line_id: input.lineId, symbol: input.symbol },
    metric_or_event_type: metricFor(input.assetClass),
    value: null,
    source: { name: "AKShare", locator: `akshare:daily:${input.symbol}` },
    observation_or_event_time: input.latestCompleteTradingDay,
    fetched_at: input.acquiredAt,
    status: "failed",
    limitations: [limitation],
    provenance: "observed",
  };
}

function evidenceRows(input: Parameters<MarketEvidenceSource["collectMarketEvidence"]>[0], result: WorkerResult): EvidenceRecord[] {
  if (result.status !== "available" || result.rows.length < 3) {
    return [failedEvidence(input, result.status === "unsupported"
      ? "AKShare 不支持该资产类别或代码。"
      : result.status === "empty"
        ? "AKShare 未返回最近三个有效交易日的收盘数据。"
        : "AKShare 查询失败，未取得可核验收盘数据。")];
  }
  return result.rows.map((row, index) => ({
    id: evidenceId(input.lineId, row.date),
    scope: { kind: "asset" as const, line_id: input.lineId, symbol: input.symbol },
    metric_or_event_type: metricFor(result.assetClass),
    value: row.close,
    unit: unitFor(result.assetClass),
    normalization_note: "unitless_return_eligible:same_provider_method",
    source: { name: "AKShare", locator: `akshare:${result.method ?? "daily"}:${input.symbol}:${row.date}` },
    observation_or_event_time: row.date,
    fetched_at: input.acquiredAt,
    status: index === result.rows.length - 1 ? "available" as const : "ambiguous" as const,
    limitations: index === result.rows.length - 1
      ? [result.assetClass === "fund"
          ? "单位净值来自 AKShare 公开开放式基金接口，按人民币/份计价；历史行仅用于同一来源的连续收益派生。"
          : "收盘价来自 AKShare 公开日线接口，按人民币计价；历史行仅用于同一来源的连续收益派生。"]
      : [result.assetClass === "fund"
          ? "历史单位净值仅与同一 AKShare 方法的连续观察值共同用于派生涨跌幅。"
          : "历史收盘价仅与同一 AKShare 方法的连续观察值共同用于派生涨跌幅。"],
    provenance: "observed" as const,
  }));
}

export interface AkshareMarketEvidenceSourceOptions {
  pythonExecutable?: string;
  workerPath?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export class AkshareMarketEvidenceSource implements MarketEvidenceSource {
  private readonly pythonExecutable: string;
  private readonly workerPath: string;
  private readonly timeoutMs: number;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: AkshareMarketEvidenceSourceOptions = {}) {
    this.pythonExecutable = options.pythonExecutable ?? process.env.AKSHARE_PYTHON_EXECUTABLE ??
      "/home/evil/.local/share/mandune-dev/akshare-venv/bin/python";
    this.workerPath = options.workerPath ?? fileURLToPath(new URL("./akshare-worker.py", import.meta.url));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.env = options.env ?? process.env;
  }

  async collectMarketEvidence(input: Parameters<MarketEvidenceSource["collectMarketEvidence"]>[0]): Promise<EvidenceRecord[]> {
    const endDate = input.latestCompleteTradingDay;
    const start = new Date(`${endDate}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - MARKET_LOOKBACK_CALENDAR_DAYS);
    const request = {
      requests: [{
        lineId: input.lineId,
        assetClass: input.assetClass,
        symbol: input.symbol,
        startDate: start.toISOString().slice(0, 10),
        endDate,
      }],
    };
    if (input.signal.aborted) return [failedEvidence(input, "AKShare 查询在开始前已取消。")];

    return new Promise((resolve) => {
      const child = spawn(this.pythonExecutable, [this.workerPath], {
        env: { ...this.env, PYTHONUNBUFFERED: "1" },
        stdio: ["pipe", "pipe", "ignore"],
      });
      let stdout = "";
      let settled = false;
      const finish = (records: EvidenceRecord[]) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        input.signal.removeEventListener("abort", abort);
        resolve(records);
      };
      const abort = () => { child.kill("SIGTERM"); finish([failedEvidence(input, "AKShare 查询被取消。")]); };
      const timer = setTimeout(() => { child.kill("SIGTERM"); finish([failedEvidence(input, "AKShare 查询超时。")]); }, this.timeoutMs);
      child.on("error", () => finish([failedEvidence(input, "AKShare Python 环境不可用。")]));
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
          child.kill("SIGTERM");
          finish([failedEvidence(input, "AKShare worker 输出超过限制。")]);
        }
      });
      child.on("close", () => {
        if (settled) return;
        try {
          const payload = JSON.parse(stdout) as { status?: unknown; results?: unknown };
          const result = Array.isArray(payload.results) ? payload.results[0] : undefined;
          finish(payload.status === "completed" && validResult(result) ? evidenceRows(input, result) :
            [failedEvidence(input, "AKShare worker 返回格式无效。")]);
        } catch {
          finish([failedEvidence(input, "AKShare worker 未返回有效数据。")]);
        }
      });
      input.signal.addEventListener("abort", abort, { once: true });
      child.stdin.end(JSON.stringify(request));
    });
  }
}
