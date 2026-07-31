import { serve, type ServerType } from "@hono/node-server";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app.js";
import {
  DEVELOPMENT_WORKSPACE_COOKIE,
  FakeClock,
  MemoryWorkspaceStore,
  WORKSPACE_COOKIE,
  WORKSPACE_TTL_MS,
  WorkspaceService,
} from "../../src/workspace/index.js";

const servers: ServerType[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
});

async function listen(service?: WorkspaceService): Promise<string> {
  const app = createApp({ port: 0, version: "0.1.0-test" }, service);
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("bind failed");
  }
  return `http://127.0.0.1:${address.port}`;
}

function cookieFrom(response: Response): string | undefined {
  const raw = response.headers.getSetCookie?.() ?? [];
  const header =
    raw.find((item) => item.startsWith(`${WORKSPACE_COOKIE}=`)) ??
    response.headers.get("set-cookie") ??
    undefined;
  if (!header) return undefined;
  const match = header.match(new RegExp(`${WORKSPACE_COOKIE}=([^;]+)`));
  return match?.[1];
}

describe("WorkspaceService isolation and TTL", () => {
  it("isolates two workspaces and rejects forged locators without leaking", async () => {
    const service = new WorkspaceService(new MemoryWorkspaceStore());
    const a = await service.create();
    const b = await service.create();
    expect(a.record.locator).not.toBe(b.record.locator);
    expect(a.record.workspace_id).not.toBe(b.record.workspace_id);

    const aOk = await service.authorize(a.record.locator);
    const bOk = await service.authorize(b.record.locator);
    expect(aOk.ok && aOk.workspace.workspace_id).toBe(a.record.workspace_id);
    expect(bOk.ok && bOk.workspace.workspace_id).toBe(b.record.workspace_id);

    const forged = await service.authorize("forged-locator-value-xxxxxxxxxxxx");
    const missing = await service.authorize(undefined);
    expect(forged).toEqual({ ok: false, code: "unauthorized" });
    expect(missing).toEqual({ ok: false, code: "unauthorized" });
  });

  it("extends expiry on activity and purges with virtual clock", async () => {
    const clock = new FakeClock(new Date("2026-07-01T00:00:00.000Z"));
    const service = new WorkspaceService(new MemoryWorkspaceStore(), clock);
    const created = await service.create();
    const firstExpiry = created.record.expires_at;

    clock.advanceMs(5 * 24 * 60 * 60 * 1000);
    const touched = await service.touch(created.record.locator);
    expect(touched.ok).toBe(true);
    if (!touched.ok) return;
    expect(touched.workspace.expires_at > firstExpiry).toBe(true);

    clock.advanceMs(WORKSPACE_TTL_MS + 1);
    const expired = await service.authorize(created.record.locator);
    expect(expired).toEqual({ ok: false, code: "unauthorized" });

    // recreate and purge
    clock.set(new Date("2026-07-01T00:00:00.000Z"));
    const again = await service.create();
    clock.advanceMs(WORKSPACE_TTL_MS + 1);
    const purged = await service.purgeExpired();
    expect(purged.purged).toContain(again.record.workspace_id);
    expect(await service.authorize(again.record.locator)).toEqual({
      ok: false,
      code: "unauthorized",
    });
  });

  it("active delete cascades and removes access", async () => {
    const service = new WorkspaceService();
    const created = await service.create();
    const deleted = await service.delete(created.record.locator);
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.result.cascade.portfolio).toBe(true);
    expect(deleted.result.cascade.analysis_history).toBe(true);
    expect(await service.authorize(created.record.locator)).toEqual({
      ok: false,
      code: "unauthorized",
    });
  });
});

describe("workspace HTTP API", () => {
  it("supports cookie-bound workspaces on explicit HTTP development routes", async () => {
    const app = createApp({
      version: "http-development",
      workspaceCookie: { name: DEVELOPMENT_WORKSPACE_COOKIE, secure: false },
    });
    const created = await app.request("http://tailnet.test/api/workspaces", { method: "POST" });
    const setCookie = created.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${DEVELOPMENT_WORKSPACE_COOKIE}=`);
    expect(setCookie).toMatch(/; HttpOnly/i);
    expect(setCookie).not.toMatch(/; Secure/i);

    const cookie = setCookie.split(";", 1)[0] ?? "";
    const draft = await app.request("http://tailnet.test/api/current-draft", {
      headers: { cookie },
    });
    expect(draft.status).toBe(200);
    expect(await draft.json()).toEqual({ draft: null });
  });

  it("creates cookie-bound workspace and hides existence on bad locator", async () => {
    const base = await listen();
    const created = await fetch(`${base}/api/workspaces`, { method: "POST" });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      workspace: { workspace_id: string; last_active_at: string; expires_at: string };
    };
    expect(body.workspace.workspace_id).toMatch(/^ws_/);
    expect(JSON.stringify(body)).not.toMatch(/locator|portfolio|token|password/i);

    const locator = cookieFrom(created);
    expect(locator).toBeTruthy();

    const current = await fetch(`${base}/api/workspaces/current`, {
      headers: { cookie: `${WORKSPACE_COOKIE}=${locator}` },
    });
    expect(current.status).toBe(200);

    const bad = await fetch(`${base}/api/workspaces/current`, {
      headers: { cookie: `${WORKSPACE_COOKIE}=not-a-real-locator` },
    });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: "unauthorized" });

    const noCookie = await fetch(`${base}/api/workspaces/current`);
    expect(noCookie.status).toBe(401);
    expect(await noCookie.json()).toEqual({ error: "unauthorized" });
  });

  it("does not enumerate workspaces at public entry", async () => {
    const base = await listen();
    const listed = await fetch(`${base}/api/workspaces`);
    // GET collection is not implemented — must not list private workspaces
    expect([404, 405]).toContain(listed.status);
  });
});
