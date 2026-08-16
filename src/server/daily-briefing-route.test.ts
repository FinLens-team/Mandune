import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("daily briefing runtime route", () => {
  it("serves generated JSON from the mutable runtime directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mandong-runtime-route-"));
    roots.push(root);
    await mkdir(path.join(root, "latest"), { recursive: true });
    await writeFile(path.join(root, "latest", "eastern_observation.json"), '{"runtime":true}');
    const app = createApp({ version: "test", dailyBriefingsDirectory: root });
    const response = await app.request("http://localhost/daily-briefings/latest/eastern_observation.json");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ runtime: true });
  });
});