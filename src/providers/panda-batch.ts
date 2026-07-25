import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
const MAX_BATCH_SIZE = 500;
const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
const KILL_GRACE_MS = 250;

function validRequest(request: PandaBatchRequest): boolean {
  return request.lineId.trim().length > 0 && request.lineId.length <= 160 &&
    request.symbol.trim().length > 0 && request.symbol.length <= 40 &&
    (request.assetClass === "a_share" || request.assetClass === "etf" || request.assetClass === "fund") &&
    ISO_DATE.test(request.startDate) && ISO_DATE.test(request.endDate) &&
    request.startDate <= request.endDate;
}

function validRow(value: unknown): value is PandaBatchRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<PandaBatchRow>;
  return typeof row.date === "string" && ISO_DATE.test(row.date) &&
    typeof row.metric === "string" && row.metric.length > 0 && row.metric.length <= 40 &&
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

function privateEnvironment(source: NodeJS.ProcessEnv, authDirectory: string): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {
    HOME: authDirectory,
    XDG_CONFIG_HOME: authDirectory,
    PANDA_AUTH_DIR: authDirectory,
    PANDA_USERNAME: source.PANDA_USERNAME,
    PANDA_PASSWORD: source.PANDA_PASSWORD,
  };
  for (const key of ["PATH", "PYTHONPATH", "LANG", "LC_ALL", "LD_LIBRARY_PATH"] as const) {
    if (source[key]) result[key] = source[key];
  }
  return result;
}

function signalProcessGroup(pid: number | undefined, child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process has already exited.
    }
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
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 120_000) {
      throw new Error("invalid_panda_batch_timeout");
    }
  }

  async collect(requests: readonly PandaBatchRequest[], signal: AbortSignal): Promise<PandaBatchResult[]> {
    if (requests.length === 0 || requests.length > MAX_BATCH_SIZE || !requests.every(validRequest)) {
      throw new Error("invalid_panda_batch_request");
    }
    if (signal.aborted) throw new DOMException("PandaAI batch cancelled", "AbortError");
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
    await chmod(authDirectory, 0o700);
    try {
      return await new Promise<PandaBatchResult[]>((resolve, reject) => {
        const child = spawn(this.pythonExecutable, [this.workerPath], {
          detached: true,
          env: privateEnvironment(this.env, authDirectory),
          stdio: ["pipe", "pipe", "ignore"],
        });
        let stdout = "";
        let settled = false;
        let terminalError: Error | DOMException | undefined;
        let killTimer: ReturnType<typeof setTimeout> | undefined;

        const finish = (operation: () => void): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (killTimer) clearTimeout(killTimer);
          signal.removeEventListener("abort", aborted);
          operation();
        };
        const stop = (error: Error | DOMException): void => {
          if (settled || terminalError) return;
          terminalError = error;
          signalProcessGroup(child.pid, child, "SIGTERM");
          killTimer = setTimeout(() => signalProcessGroup(child.pid, child, "SIGKILL"), KILL_GRACE_MS);
          killTimer.unref?.();
        };
        const aborted = (): void => stop(new DOMException("PandaAI batch cancelled", "AbortError"));
        const timeout = setTimeout(() => stop(new Error("panda_batch_timeout")), this.timeoutMs);

        signal.addEventListener("abort", aborted, { once: true });
        child.on("error", () => finish(() => reject(new Error("panda_worker_unavailable"))));
        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
          if (Buffer.byteLength(stdout, "utf8") > MAX_STDOUT_BYTES) {
            stop(new Error("panda_worker_output_too_large"));
          }
        });
        child.on("close", () => finish(() => {
          if (terminalError) {
            reject(terminalError);
            return;
          }
          try {
            const payload = JSON.parse(stdout) as { status?: unknown; results?: unknown };
            if (payload.status !== "completed" || !Array.isArray(payload.results) ||
              payload.results.length !== requests.length || !payload.results.every(validResult)) {
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
