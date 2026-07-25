import { describe, expect, it, vi } from "vitest";
import { createAnthropicMessagesModelGateway } from "../../src/model/index.js";

describe("Anthropic Messages model gateway", () => {
  it("maps a Messages response to the structured gateway contract", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "```json\n{\"schema_version\":\"test.v1\",\"answer\":\"ok\"}\n```" }],
      stop_reason: "end_turn",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const gateway = createAnthropicMessagesModelGateway({
      providerName: "test-anthropic",
      baseURL: "https://models.example.test/v1",
      apiKey: "test-key",
      modelId: "test-model",
      fetch: fetcher,
    });

    await expect(gateway.generate({
      operation: "test",
      schemaVersion: "test.v1",
      schema: { type: "object" },
      instructions: "Return JSON.",
      input: {},
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    })).resolves.toEqual({
      ok: true,
      value: { schema_version: "test.v1", answer: "ok" },
      finishReason: "stop",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://models.example.test/v1/messages",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it("marks throttling as retryable without exposing response bodies", async () => {
    const gateway = createAnthropicMessagesModelGateway({
      providerName: "test-anthropic",
      baseURL: "https://models.example.test/v1",
      apiKey: "test-key",
      modelId: "test-model",
      fetch: async () => new Response("secret upstream body", { status: 429 }),
    });

    await expect(gateway.generate({
      operation: "test",
      schemaVersion: "test.v1",
      schema: { type: "object" },
      instructions: "Return JSON.",
      input: {},
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    })).resolves.toEqual({ ok: false, code: "provider_failure", retryable: true });
  });
});
