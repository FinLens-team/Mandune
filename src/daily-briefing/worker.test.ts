import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelGateway } from "../model/index.js";
import { DAILY_BRIEFING_THEME_IDS } from "./contracts.js";
import { runDailyBriefing } from "./worker.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function marketFetch(): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const code = url.searchParams.get("param")?.split(",")[0] ?? "sh000001";
    const closes: Record<string, [number, number]> = {
      sh000001: [3600, 3618], sz399001: [11200, 11312], sz399006: [2300, 2323],
    };
    const [previous, current] = closes[code]!;
    return new Response(JSON.stringify({ data: { [code]: { day: [
      ["2026-08-12", "0", String(previous)], ["2026-08-13", "0", String(current)],
    ] } } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function copyGateway(): ModelGateway {
  return {
    async generate<T>() {
      const themes = Object.fromEntries(DAILY_BRIEFING_THEME_IDS.map((theme) => [theme, {
        schema_version: "daily-briefing.v2", title: `${theme} 今日市场`, dek: "仅依据已核验公开行情。",
        sections: [{ heading: "盘面", body: "三大指数数据见统一事实底稿。" }, { heading: "边界", body: "没有纳入可核验新闻，不补写原因或预测。" }],
      }]));
      return { ok: true, value: { schema_version: "daily-briefing.v2", themes } as T };
    },
  };
}

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(os.tmpdir(), "mandong-daily-"));
  roots.push(value);
  return value;
}

describe("daily briefing worker", () => {
  it("generates seven validated themes and atomically publishes latest", async () => {
    const directory = await root();
    const result = await runDailyBriefing({ date: "2026-08-13", root: directory, fetchImpl: marketFetch(), gateway: copyGateway(), env: {} });
    expect(result.reused).toBe(false);
    const dated = await readdir(path.join(directory, "2026-08-13"));
    const latest = await readdir(path.join(directory, "latest"));
    expect(dated.sort()).toEqual(DAILY_BRIEFING_THEME_IDS.map((theme) => `${theme}.json`).sort());
    expect(latest.sort()).toEqual(dated.sort());
    const values = await Promise.all(DAILY_BRIEFING_THEME_IDS.map(async (theme) => JSON.parse(await readFile(path.join(directory, "latest", `${theme}.json`), "utf8"))));
    expect(new Set(values.map((value) => value.fact_sheet_id)).size).toBe(1);
    expect(values.every((value) => value.news.length === 0 && value.market.length === 3)).toBe(true);
  });

  it("is date-idempotent and does not call market or model again", async () => {
    const directory = await root();
    const fetchImpl = marketFetch();
    const gateway = copyGateway();
    const generate = vi.spyOn(gateway, "generate");
    await runDailyBriefing({ date: "2026-08-13", root: directory, fetchImpl, gateway, env: {} });
    const result = await runDailyBriefing({ date: "2026-08-13", root: directory, fetchImpl, gateway, env: {} });
    expect(result.reused).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("rejects a concurrent run and recovers a stale process lock", async () => {
    const directory = await root();
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, ".lock"), `${process.pid}\n`);
    await expect(runDailyBriefing({ date: "2026-08-13", root: directory, fetchImpl: marketFetch(), gateway: copyGateway(), env: {} }))
      .rejects.toThrow("already running");
    await writeFile(path.join(directory, ".lock"), "999999999\n");
    await expect(runDailyBriefing({ date: "2026-08-13", root: directory, fetchImpl: marketFetch(), gateway: copyGateway(), env: {} }))
      .resolves.toMatchObject({ reused: false });
  });

  it("keeps current latest intact when generation fails", async () => {
    const directory = await root();
    await runDailyBriefing({ date: "2026-08-13", root: directory, fetchImpl: marketFetch(), gateway: copyGateway(), env: {} });
    const before = await readFile(path.join(directory, "latest", "eastern_observation.json"), "utf8");
    const failing: ModelGateway = { async generate() { return { ok: false, code: "provider_failure", retryable: true }; } };
    await expect(runDailyBriefing({ date: "2026-08-14", root: directory, fetchImpl: marketFetch(), gateway: failing, env: {} })).rejects.toThrow("provider_failure");
    expect(await readFile(path.join(directory, "latest", "eastern_observation.json"), "utf8")).toBe(before);
  });
});
