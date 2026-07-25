import path from "node:path";
import { describe, expect, it } from "vitest";
import { A2A_DEEP_REVIEW_ENDPOINT_ID } from "../a2a/index.js";
import { loadServerConfig } from "./config.js";

function baseEnv(): NodeJS.ProcessEnv {
  return {
    MANDONG_DB_PATH: path.resolve(".tmp/config-test.sqlite3"),
    MANDONG_MIGRATIONS_DIR: path.resolve("migrations"),
  };
}

describe("A2A server config", () => {
  it("keeps the A2A interface disabled when no A2A variables are present", () => {
    expect(loadServerConfig(baseEnv()).a2a).toBeUndefined();
  });

  it("uses the fixed Volcano Ark DeepSeek-Pro endpoint with independent credentials", () => {
    const config = loadServerConfig({
      ...baseEnv(),
      ARK_API_KEY: "test-model-key",
      A2A_BEARER_TOKEN: "test-bearer-token-at-least-24-characters",
    });

    expect(config.a2a).toEqual({
      baseURL: "https://ark.cn-beijing.volces.com/api/v3",
      apiKey: "test-model-key",
      modelId: A2A_DEEP_REVIEW_ENDPOINT_ID,
      bearerToken: "test-bearer-token-at-least-24-characters",
    });
  });

  it("fails closed for partial config and validates an Ark base URL override", () => {
    expect(() => loadServerConfig({
      ...baseEnv(),
      ARK_API_KEY: "test-model-key",
    })).toThrow(/Incomplete A2A config/u);

    expect(loadServerConfig({
      ...baseEnv(),
      ARK_API_KEY: "test-model-key",
      A2A_BEARER_TOKEN: "test-bearer-token-at-least-24-characters",
      ARK_BASE_URL: "http://localhost:9000/api/v3",
    }).a2a?.baseURL).toBe("http://localhost:9000/api/v3");

    expect(() => loadServerConfig({
      ...baseEnv(),
      ARK_API_KEY: "test-model-key",
      A2A_BEARER_TOKEN: "test-bearer-token-at-least-24-characters",
      ARK_BASE_URL: "http://ark.example.com/api/v3",
    })).toThrow(/Invalid ARK_BASE_URL/u);
  });
});
