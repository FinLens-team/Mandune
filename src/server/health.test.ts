import { serve, type ServerType } from "@hono/node-server";
import { afterEach, describe, expect, it } from "vitest";
import type { HealthResponse } from "../contracts/index.js";
import { createApp } from "./app.js";

const servers: ServerType[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    ),
  );
});

async function listen(): Promise<string> {
  const app = createApp({ port: 0, version: "0.1.0-test" });
  const server = serve({
    fetch: app.fetch,
    port: 0,
    hostname: "127.0.0.1",
  });
  servers.push(server);

  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind ephemeral health-check port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

describe("GET /health", () => {
  it("returns only safe liveness fields over a real HTTP port", async () => {
    const baseUrl = await listen();
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);

    const body = (await response.json()) as HealthResponse;
    expect(body).toEqual({
      status: "ok",
      service: "mandong",
      version: "0.1.0-test",
      uptime_seconds: expect.any(Number),
    });
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(Object.keys(body).sort()).toEqual(
      ["service", "status", "uptime_seconds", "version"].sort(),
    );
  });

  it("serves source public daily briefings in development", async () => {
    const baseUrl = await listen();
    const response = await fetch(`${baseUrl}/daily-briefings/latest/female_succubus.json`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    await expect(response.json()).resolves.toMatchObject({
      schema_version: "daily-briefing.v2",
      theme_id: "female_succubus",
    });
  });

  it("does not echo model environment values", async () => {
    const previousApiKey = process.env.MODEL_API_KEY;
    const previousBaseUrl = process.env.MODEL_BASE_URL;
    const marker = "secret-marker-should-not-leak-xyz";

    try {
      process.env.MODEL_API_KEY = marker;
      process.env.MODEL_BASE_URL = `https://example.invalid/${marker}`;

      const baseUrl = await listen();
      const response = await fetch(`${baseUrl}/health`);
      const text = await response.text();

      expect(text).not.toContain(marker);
      expect(text).not.toContain("MODEL_API_KEY");
      expect(text).not.toContain("MODEL_BASE_URL");
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.MODEL_API_KEY;
      } else {
        process.env.MODEL_API_KEY = previousApiKey;
      }
      if (previousBaseUrl === undefined) {
        delete process.env.MODEL_BASE_URL;
      } else {
        process.env.MODEL_BASE_URL = previousBaseUrl;
      }
    }
  });
});
