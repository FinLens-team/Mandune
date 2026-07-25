import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AssetClass } from "../contracts/index.js";

export interface PandaBatchRequest {
  lineId: string;
  assetClass: AssetClass;
  symbol: string;
  startDate: string;
  endDate: string;
}

export interface PandaBatchRow {
  date: string;
  metric: string;
  value: number;
}

export interface PandaBatchResult {
  lineId: string;
  assetClass: AssetClass;
  symbol: string;
  status: "available" | "empty" | "unsupported" | "failed";
  method: string | null;
  rows: PandaBatchRow[];
  errorCode?: string;
}

export interface PandaBatchClientOptions {
  pythonExecutable?: string;
  workerPath?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STDOUT_BYTES = 5 * 1024 * 1024;

function validRequest(request: PandaBatchRequest): boolean {
  return Boolean(request.lineId.trim()) && Boolean(request.symbol.trim()) &&
    ISO_DATE.test(request.startDate) && ISO_DATE.test(request.endDate) &&
    request.startDate <= request.endDate;
}

function validRow(value: unknown): value is PandaBatchRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<PandaBatchRow>;
  return typeof row.date === "string" && ISO_DATE.test(row.date) &&
    typeof row.metric === "string" && row.metric.length > 0 &&
    typeof row.value === "number" && Number.isFinite(row.value);
}

function validResult(value: unknown): value is PandaBatchResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<PandaBatchResult>;
  return typeof result.lineId === "string" && typeof result.symbol === "string" &&
    (result.assetClass === "a_share" || result.assetClass === "etf" || result.assetClass === "fund") &&
    (result.status === "available" || result.status === "empty" ||
      result.status === "unsupported" || result.status === "failed") &&
    (result.method === null || typeof result.method === "string") &&
    Array.isArray(result.rows) && result.rows.every(validRow) &&
    (result.errorCode === undefined || typeof result.errorCode === "string");
}

function terminate(child: ReturnType<typeof spawn>): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

export class PandaBatchClient {
  private readonly pythonExecutable: string;
  private readonly workerPath: string;
  private readonly timeoutMs: number;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: PandaBatchClientOptions = {}) {
    this.pythonExecutable = options.pythonExecutable ?? "python3.12";
    this.workerPath = options.workerPath ?? path.resolve("src/providers/panda-worker.py");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.env = options.env ?? process.env;
  }

  async collect(requests: readonly PandaBatchRequest[], signal: AbortSignal): Promise<PandaBatchResult[]> {
    if (requests.length === 0 || !requests.every(validRequest)) throw new Error("invalid_panda_batch_request");
    if (!this.env.PANDA_USERNAME || !this.env.PANDA_PASSWORD) {
      return requests.map((request) => ({
        lineId: request.lineId,
        assetClass: request.assetClass,
        symbol: request.symbol,
        status: "failed",
        method: null,
        rows: [],
        errorCode: "credentials_unavailable",
      }));
    }

    const authDirectory = await mkdtemp(path.join(tmpdir(), "mandong-panda-auth-"));
    try {
      return await new Promise<PandaBatchResult[]>((resolve, reject) => {
        const child = spawn(this.pythonExecutable, [this.workerPath], {
          detached: true,
          env: { ...this.env, PANDA_AUTH_DIR: authDirectory },
          stdio: ["pipe", "pipe", "ignore"],
        });
        let stdout = "";
        let settled = false;
        const finish = (operation: () => void): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          signal.removeEventListener("abort", aborted);
          operation();
        };
        const aborted = (): void => {
          terminate(child);
          finish(() => reject(new DOMException("PandaAI batch cancelled", "AbortError")));
        };
        const timeout = setTimeout(() => {
          terminate(child);
          finish(() => reject(new Error("panda_batch_timeout")));
        }, this.timeoutMs);
        signal.addEventListener("abort", aborted, { once: true });
        child.on("error", () => finish(() => reject(new Error("panda_worker_unavailable"))));
        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
          if (Buffer.byteLength(stdout, "utf8") > MAX_STDOUT_BYTES) {
            terminate(child);
            finish(() => reject(new Error("panda_worker_output_too_large")));
          }
        });
        child.on("close", () => finish(() => {
          try {
            const payload = JSON.parse(stdout) as { status?: unknown; results?: unknown };
            if (payload.status !== "completed" || !Array.isArray(payload.results) ||
              !payload.results.every(validResult)) {
              reject(new Error("panda_worker_malformed_output"));
              return;
            }
            resolve(payload.results);
          } catch {
            reject(new Error("panda_worker_malformed_output"));
          }
        }));
        child.stdin.end(JSON.stringify({ requests }));
        if (signal.aborted) aborted();
      });
    } finally {
      await rm(authDirectory, { recursive: true, force: true });
    }
  }
}
