import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../src/server/config.js";

const BASE = {
  MANDONG_DB_PATH: "/tmp/mandong-config-test.sqlite3",
  MANDONG_MIGRATIONS_DIR: "/tmp/mandong-migrations",
};

describe("daily review V2 server config", () => {
  it("accepts only step-explore when a live model is configured", () => {
    expect(() => loadServerConfig({
      ...BASE,
      MODEL_BASE_URL: "https://models.example.test/v1",
      MODEL_API_KEY: "test-secret-value",
      MODEL_ID: "another-model",
    })).toThrow("daily review V2 only permits step-explore");

    expect(loadServerConfig({
      ...BASE,
      MODEL_BASE_URL: "https://models.example.test/v1",
      MODEL_API_KEY: "test-secret-value",
      MODEL_ID: "step-explore",
      BOCHA_API_KEY: "test-bocha-secret",
    })).toMatchObject({
      model: { modelId: "step-explore", supportsStructuredOutputs: false },
      bochaApiKey: "test-bocha-secret",
    });
  });

  it("still starts without model or provider credentials", () => {
    const config = loadServerConfig(BASE);
    expect(config.model).toBeUndefined();
    expect(config.bochaApiKey).toBeUndefined();
  });
});
