import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app.js";
import { WORKSPACE_COOKIE } from "../../src/workspace/index.js";
import { INSTRUMENT_DICTIONARY_AS_OF } from "../../src/instruments/index.js";

function app() {
  return createApp({ version: "instruments-test" });
}

async function createCookie(instance: ReturnType<typeof createApp>): Promise<string> {
  const response = await instance.request("http://localhost/api/workspaces", {
    method: "POST",
  });
  expect(response.status).toBe(201);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  expect(cookie).toContain(`${WORKSPACE_COOKIE}=`);
  return cookie;
}

async function search(
  instance: ReturnType<typeof createApp>,
  cookie: string,
  query: string,
): Promise<Response> {
  return await instance.request(`http://localhost/api/instruments/search${query}`, {
    headers: { cookie },
  });
}

describe("GET /api/instruments/search", () => {
  it("requires an authorized workspace", async () => {
    const instance = app();
    const response = await instance.request(
      "http://localhost/api/instruments/search?q=hs300",
    );
    expect(response.status).toBe(401);
  });

  it("returns fuzzy suggestions with reference metadata and no-store", async () => {
    const instance = app();
    const cookie = await createCookie(instance);
    const response = await search(instance, cookie, "?q=hs300");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      suggestions: { symbol: string; name: string; asset_class: string }[];
      dictionary_as_of: string;
    };
    expect(body.dictionary_as_of).toBe(INSTRUMENT_DICTIONARY_AS_OF);
    expect(body.suggestions[0]).toEqual({
      symbol: "510300.SH",
      name: "沪深300ETF",
      asset_class: "etf",
      market: "SH",
    });
  });

  it("supports the optional asset_class filter", async () => {
    const instance = app();
    const cookie = await createCookie(instance);
    const response = await search(instance, cookie, "?q=000001&asset_class=fund");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { suggestions: { symbol: string }[] };
    expect(body.suggestions.map((item) => item.symbol)).toEqual(["000001.OF"]);
  });

  it("rejects oversized queries and unknown asset classes", async () => {
    const instance = app();
    const cookie = await createCookie(instance);
    const oversized = await search(instance, cookie, `?q=${"a".repeat(33)}`);
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toEqual({ error: "invalid_query" });
    const badClass = await search(instance, cookie, "?q=510300&asset_class=crypto");
    expect(badClass.status).toBe(400);
    expect(await badClass.json()).toEqual({ error: "invalid_asset_class" });
  });

  it("returns empty suggestions for empty or unmatched queries instead of failing", async () => {
    const instance = app();
    const cookie = await createCookie(instance);
    for (const query of ["", "?q=", "?q=%E4%B8%8D%E5%AD%98%E5%9C%A8"]) {
      const response = await search(instance, cookie, query);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { suggestions: unknown[] };
      expect(body.suggestions).toEqual([]);
    }
  });
});
