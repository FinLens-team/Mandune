import { describe, expect, it, vi } from "vitest";
import { createFallbackModelGateway } from "../../src/model/index.js";
import type { ModelGateway, ModelGatewayRequest } from "../../src/model/index.js";

function request(): ModelGatewayRequest {
  return {
    operation: "test",
    schemaVersion: "test.v1",
    schema: { type: "object" },
    instructions: "Return JSON.",
    input: {},
    signal: new AbortController().signal,
    timeoutMs: 1_000,
  };
}

describe("model fallback gateway", () => {
  it("uses the next provider after an upstream failure", async () => {
    const second = vi.fn(async <T>() => ({
      ok: true as const,
      value: { schema_version: "test.v1" } as T,
    }));
    const gateways: ModelGateway[] = [
      { generate: async () => ({ ok: false, code: "provider_failure", retryable: true }) },
      { generate: second as ModelGateway["generate"] },
    ];

    await expect(createFallbackModelGateway(gateways).generate(request())).resolves.toMatchObject({
      ok: true,
    });
    expect(second).toHaveBeenCalledOnce();
  });

  it("never retries a privacy rejection with another provider", async () => {
    const second = vi.fn();
    const gateways: ModelGateway[] = [
      { generate: async () => ({ ok: false, code: "privacy_violation", retryable: false }) },
      { generate: second as ModelGateway["generate"] },
    ];

    await expect(createFallbackModelGateway(gateways).generate(request())).resolves.toEqual({
      ok: false,
      code: "privacy_violation",
      retryable: false,
    });
    expect(second).not.toHaveBeenCalled();
  });
});
