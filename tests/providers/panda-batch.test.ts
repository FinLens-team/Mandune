import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PandaBatchClient, type PandaBatchRequest } from "../../src/providers/index.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const requests: PandaBatchRequest[] = [
  {
    lineId: "line-stock",
    assetClass: "a_share",
    symbol: "000001.SZ",
    startDate: "2026-07-23",
    endDate: "2026-07-24",
  },
  {
    lineId: "line-fund",
    assetClass: "fund",
    symbol: "000001.OF",
    startDate: "2026-07-23",
    endDate: "2026-07-24",
  },
];

function worker(source: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "mandong-panda-worker-test-"));
  roots.push(root);
  const workerPath = path.join(root, "worker.mjs");
  writeFileSync(workerPath, source);
  return workerPath;
}

function client(workerPath: string, timeoutMs = 2_000): PandaBatchClient {
  return new PandaBatchClient({
    pythonExecutable: process.execPath,
    workerPath,
    timeoutMs,
    env: {
      PATH: process.env.PATH,
      PANDA_USERNAME: "86-public-test-user",
      PANDA_PASSWORD: "test-only-password",
    },
  });
}

function officialCredentialClient(workerPath: string): PandaBatchClient {
  return new PandaBatchClient({
    pythonExecutable: process.execPath,
    workerPath,
    timeoutMs: 2_000,
    env: {
      PATH: process.env.PATH,
      PANDA_DATA_USERNAME: "86-public-test-user",
      PANDA_DATA_PASSWORD: "test-only-password",
    },
  });
}

describe("PandaAI batch process boundary", () => {
  it("returns one typed result per request from one worker process", async () => {
    const workerPath = worker(`
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        const requests = JSON.parse(input).requests;
        process.stdout.write(JSON.stringify({
          status: "completed",
          results: requests.map((request, index) => ({
            lineId: request.lineId,
            assetClass: request.assetClass,
            symbol: request.symbol,
            status: index === 0 ? "available" : "unsupported",
            method: index === 0 ? "get_market_data" : null,
            rows: index === 0 ? [{ date: "2026-07-24", metric: "close", value: 12.34 }] : [],
            ...(index === 0 ? {} : { errorCode: "sdk_method_missing" }),
          })),
        }));
      });
    `);

    await expect(client(workerPath).collect(requests, new AbortController().signal)).resolves.toEqual([
      expect.objectContaining({ lineId: "line-stock", status: "available", rows: [{ date: "2026-07-24", metric: "close", value: 12.34 }] }),
      expect.objectContaining({ lineId: "line-fund", status: "unsupported", errorCode: "sdk_method_missing" }),
    ]);
  });

  it("fails each item without spawning when protected credentials are absent", async () => {
    const batch = new PandaBatchClient({ workerPath: "/must/not/run", env: {} });
    const result = await batch.collect(requests, new AbortController().signal);
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.status === "failed" && item.errorCode === "credentials_unavailable"))
      .toBe(true);
  });

  it("maps the public Panda Data credential names only inside the worker", async () => {
    const workerPath = worker(`
      process.stdin.resume();
      process.stdin.on("end", () => {
        const ok = process.env.PANDA_USERNAME === "86-public-test-user" &&
          process.env.PANDA_PASSWORD === "test-only-password" &&
          process.env.PANDA_DATA_USERNAME === undefined &&
          process.env.PANDA_DATA_PASSWORD === undefined;
        process.stdout.write(JSON.stringify({
          status: "completed",
          results: ${JSON.stringify(requests)}.map((request) => ({
            lineId: request.lineId,
            assetClass: request.assetClass,
            symbol: request.symbol,
            status: ok ? "empty" : "failed",
            method: null,
            rows: [],
          })),
        }));
      });
    `);

    const result = await officialCredentialClient(workerPath)
      .collect(requests, new AbortController().signal);
    expect(result.every((item) => item.status === "empty")).toBe(true);
  });

  it("rejects malformed worker output and hard-stops a timed-out worker", async () => {
    const malformed = worker("process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('{}')); ");
    await expect(client(malformed).collect(requests, new AbortController().signal))
      .rejects.toThrow("panda_worker_malformed_output");

    const hanging = worker("process.stdin.resume(); setInterval(() => undefined, 1000);");
    await expect(client(hanging, 20).collect(requests, new AbortController().signal))
      .rejects.toThrow("panda_batch_timeout");
  });

  it("rejects invalid batches before creating a process", async () => {
    const batch = new PandaBatchClient({ workerPath: "/must/not/run", env: {} });
    await expect(batch.collect([], new AbortController().signal)).rejects.toThrow("invalid_panda_batch_request");
    await expect(batch.collect([{ ...requests[0]!, startDate: "bad-date" }], new AbortController().signal))
      .rejects.toThrow("invalid_panda_batch_request");
  });
});
