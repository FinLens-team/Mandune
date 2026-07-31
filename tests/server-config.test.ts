import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../src/server/config.js";

const BASE = {
  MANDONG_DB_PATH: "/tmp/mandong-config-test.sqlite3",
  MANDONG_MIGRATIONS_DIR: "/tmp/mandong-migrations",
};

describe("daily review V2 server config", () => {
  it("accepts any single-token MODEL_ID and defaults to stream mode", () => {
    expect(() => loadServerConfig({
      ...BASE,
      MODEL_BASE_URL: "https://models.example.test/v1",
      MODEL_API_KEY: "test-secret-value",
      MODEL_ID: "another model",
    })).toThrow("Invalid MODEL_ID");

    expect(loadServerConfig({
      ...BASE,
      MODEL_BASE_URL: "https://models.example.test/v1",
      MODEL_API_KEY: "test-secret-value",
      MODEL_ID: "another-model",
    })).toMatchObject({
      analysisMode: "stream",
      model: { modelId: "another-model", supportsStructuredOutputs: false },
    });

    expect(loadServerConfig({
      ...BASE,
      MODEL_BASE_URL: "https://models.example.test/v1",
      MODEL_API_KEY: "test-secret-value",
      MODEL_ID: "step-explore",
      BOCHA_API_KEY: "test-bocha-secret",
      MANDONG_ANALYSIS_MODE: "v2",
    })).toMatchObject({
      analysisMode: "v2",
      model: { modelId: "step-explore", supportsStructuredOutputs: false },
      bochaApiKey: "test-bocha-secret",
    });

    expect(() => loadServerConfig({
      ...BASE,
      MANDONG_ANALYSIS_MODE: "other",
    })).toThrow("Invalid MANDONG_ANALYSIS_MODE");
  });

  it("still starts without model or provider credentials", () => {
    const config = loadServerConfig(BASE);
    expect(config.model).toBeUndefined();
    expect(config.bochaApiKey).toBeUndefined();
    expect(config.workspaceCookie).toEqual({ name: "md_workspace", secure: false });
  });

  it("keeps the __Host Secure cookie contract in production", () => {
    const config = loadServerConfig({
      ...BASE,
      NODE_ENV: "production",
      MODEL_BASE_URL: "https://models.example.test/v1",
      MODEL_API_KEY: "test-secret-value",
      MODEL_ID: "test-model",
    });
    expect(config.workspaceCookie).toEqual({ name: "__Host-md_workspace", secure: true });
  });
});
