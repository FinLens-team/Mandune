import { describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleModelGateway } from "../../src/model/index.js";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "answer"],
  properties: {
    schema_version: { const: "test.v1" },
    answer: { type: "string" },
  },
} as const;

function completion(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "completion-1",
      object: "chat.completion",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function streamCompletion(chunks: readonly Record<string, unknown>[]): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("OpenAI-compatible AI SDK model gateway", () => {
  it("disables DeepSeek thinking while keeping private reasoning out of text callbacks", async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
      void _input;
      void _init;
      return streamCompletion([
        {
          id: "stream-1",
          object: "chat.completion.chunk",
          created: 1,
          model: "deepseek-v4-flash",
          choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "private chain of thought" }, finish_reason: null }],
        },
        {
          id: "stream-1",
          object: "chat.completion.chunk",
          created: 1,
          model: "deepseek-v4-flash",
          choices: [{ index: 0, delta: { content: "public answer" }, finish_reason: null }],
        },
        {
          id: "stream-1",
          object: "chat.completion.chunk",
          created: 1,
          model: "deepseek-v4-flash",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        },
      ]);
    });
    const onConnected = vi.fn();
    const onReasoningStarted = vi.fn();
    const onText = vi.fn();
    const gateway = createOpenAICompatibleModelGateway({
      providerName: "DeepSeek",
      baseURL: "https://api.deepseek.com",
      apiKey: "fixture-key",
      modelId: "deepseek-v4-flash",
      supportsStructuredOutputs: false,
      fetch,
    });

    const result = await gateway.streamGenerate!({
      instructions: "Return a public answer.",
      prompt: "fixture",
      signal: new AbortController().signal,
      timeoutMs: 1_000,
      onConnected,
      onReasoningStarted,
      onText,
    });

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ thinking: { type: "disabled" } });
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(onReasoningStarted).not.toHaveBeenCalled();
    expect(onConnected).toHaveBeenCalled();
    expect(onText).toHaveBeenCalledWith("public answer");
    expect(result).toEqual({ ok: true, text: "public answer" });
    expect(JSON.stringify({ result, textCalls: onText.mock.calls })).not.toContain("private chain of thought");
  });

  it("disables DeepSeek thinking for structured JSON generation", async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
      void _input;
      void _init;
      return completion('{"schema_version":"test.v1","answer":"ok"}');
    });
    const gateway = createOpenAICompatibleModelGateway({
      providerName: "DeepSeek",
      baseURL: "https://api.deepseek.com",
      apiKey: "server-only-secret",
      modelId: "deepseek-v4-flash",
      supportsStructuredOutputs: false,
      fetch,
    });

    const result = await gateway.generate<{ schema_version: string; answer: string }>({
      operation: "test",
      schemaVersion: "test.v1",
      schema,
      instructions: "Return json only.",
      input: {},
      signal: new AbortController().signal,
      timeoutMs: 1_000,
      maxOutputTokens: 777,
    });

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ thinking: { type: "disabled" }, max_tokens: 777 });
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(JSON.stringify(body)).toContain('\\"answer\\"');
    expect(JSON.stringify(body)).toContain("JSON Schema");
    expect(result).toMatchObject({ ok: true, value: { schema_version: "test.v1", answer: "ok" } });
  });

  it("does not send DeepSeek-specific thinking fields to generic compatible providers", async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
      void _input;
      void _init;
      return completion('{"schema_version":"test.v1","answer":"ok"}');
    });
    const gateway = createOpenAICompatibleModelGateway({
      providerName: "fixture-provider",
      baseURL: "https://models.example.test/v1",
      apiKey: "fixture-key",
      modelId: "test-model",
      supportsStructuredOutputs: true,
      fetch,
    });
    await gateway.generate({
      operation: "test",
      schemaVersion: "test.v1",
      schema,
      instructions: "Return the accepted schema.",
      input: {},
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    });
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("uses AI SDK v7 structured output without tools or internal retries", async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
      void _input;
      void _init;
      return completion('{"schema_version":"test.v1","answer":"ok"}');
    });
    const gateway = createOpenAICompatibleModelGateway({
      providerName: "fixture-provider",
      baseURL: "https://models.example.test/v1",
      apiKey: "server-only-secret",
      modelId: "test-model",
      supportsStructuredOutputs: true,
      fetch,
    });

    const result = await gateway.generate<{ schema_version: string; answer: string }>({
      operation: "test",
      schemaVersion: "test.v1",
      schema,
      instructions: "Return the accepted schema.",
      input: { public_fact: "fixture" },
      signal: new AbortController().signal,
      timeoutMs: 1_000,
      temperature: 0.35,
      maxOutputTokens: 777,
    });

    expect(result).toMatchObject({ ok: true, value: { schema_version: "test.v1", answer: "ok" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = fetch.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("tools");
    expect(body).toMatchObject({ temperature: 0.35, max_tokens: 777 });
    expect(JSON.stringify(body)).not.toContain("server-only-secret");
  });

  it("rejects malformed and wrong-version output without returning partial text", async () => {
    const fetch = vi.fn(async () => completion('{"schema_version":"wrong","answer":"partial"}'));
    const gateway = createOpenAICompatibleModelGateway({
      providerName: "fixture-provider",
      baseURL: "https://models.example.test/v1",
      apiKey: "secret",
      modelId: "test-model",
      supportsStructuredOutputs: true,
      fetch,
    });

    const result = await gateway.generate({
      operation: "test",
      schemaVersion: "test.v1",
      schema,
      instructions: "Return the accepted schema.",
      input: {},
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    });

    expect(result).toMatchObject({ ok: false, code: "malformed_output" });
    expect(result).not.toHaveProperty("text");
    expect(JSON.stringify(result)).not.toContain("partial");
  });

  it("rejects privacy-bearing structured output without returning it", async () => {
    const fetch = vi.fn(async () => completion('{"schema_version":"test.v1","answer":"contact user@example.test"}'));
    const gateway = createOpenAICompatibleModelGateway({
      providerName: "fixture-provider",
      baseURL: "https://models.example.test/v1",
      apiKey: "secret",
      modelId: "test-model",
      supportsStructuredOutputs: true,
      fetch,
    });

    const result = await gateway.generate({
      operation: "test",
      schemaVersion: "test.v1",
      schema,
      instructions: "Return the accepted schema.",
      input: {},
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    });

    expect(result).toMatchObject({ ok: false, code: "privacy_violation" });
    expect(JSON.stringify(result)).not.toContain("user@example.test");
  });

  it("fails closed before transport when config or request privacy is invalid", async () => {
    const fetch = vi.fn(async () => completion("{}"));
    const gateway = createOpenAICompatibleModelGateway({
      providerName: "fixture-provider",
      baseURL: "https://models.example.test/v1",
      apiKey: "",
      modelId: "test-model",
      supportsStructuredOutputs: true,
      fetch,
    });
    const result = await gateway.generate({
      operation: "test",
      schemaVersion: "test.v1",
      schema,
      instructions: "x",
      input: { account_number: "private" },
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    });
    expect(result).toMatchObject({ ok: false, code: "configuration_unavailable" });
    expect(fetch).not.toHaveBeenCalled();

    const configured = createOpenAICompatibleModelGateway({
      providerName: "fixture-provider",
      baseURL: "https://models.example.test/v1",
      apiKey: "secret",
      modelId: "test-model",
      supportsStructuredOutputs: true,
      fetch,
    });
    expect(await configured.generate({
      operation: "test",
      schemaVersion: "test.v1",
      schema,
      instructions: "x",
      input: { account_number: "private" },
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    })).toMatchObject({ ok: false, code: "privacy_violation" });
    expect(await configured.generate({
      operation: "test",
      schemaVersion: "test.v1",
      schema,
      instructions: "x",
      input: {
        evidence: [{ source: { locator: "https://source.example.test/item?access_token=private-token" } }],
      },
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    })).toMatchObject({ ok: false, code: "privacy_violation" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("normalizes provider, timeout, and cancellation failures without response bodies", async () => {
    const cases = [
      [new AbortController(), async () => new Response("provider secret body", { status: 503 }), "provider_failure"],
      [new AbortController(), async (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))), "timeout"],
    ] as const;

    for (const [controller, fetch, code] of cases) {
      const gateway = createOpenAICompatibleModelGateway({
        providerName: "fixture-provider",
        baseURL: "https://models.example.test/v1",
        apiKey: "secret",
        modelId: "test-model",
        supportsStructuredOutputs: true,
        fetch,
      });
      const result = await gateway.generate({
        operation: "test",
        schemaVersion: "test.v1",
        schema,
        instructions: "x",
        input: {},
        signal: controller.signal,
        timeoutMs: code === "timeout" ? 5 : 1_000,
      });
      expect(result).toMatchObject({ ok: false, code });
      expect(JSON.stringify(result)).not.toContain("provider secret body");
    }

    const controller = new AbortController();
    controller.abort();
    const cancelled = createOpenAICompatibleModelGateway({
      providerName: "fixture-provider",
      baseURL: "https://models.example.test/v1",
      apiKey: "secret",
      modelId: "test-model",
      supportsStructuredOutputs: true,
      fetch: async () => completion("{}"),
    });
    expect(await cancelled.generate({
      operation: "test",
      schemaVersion: "test.v1",
      schema,
      instructions: "x",
      input: {},
      signal: controller.signal,
      timeoutMs: 1_000,
    })).toMatchObject({ ok: false, code: "cancelled" });
  });

  it("keeps provider and model configuration replaceable behind the same gateway", async () => {
    const firstFetch = vi.fn(async (_input: string | URL | Request) => {
      void _input;
      return completion('{"schema_version":"test.v1","answer":"first"}');
    });
    const secondFetch = vi.fn(async (_input: string | URL | Request) => {
      void _input;
      return completion('{"schema_version":"test.v1","answer":"second"}');
    });
    const gateways = [
      createOpenAICompatibleModelGateway({ providerName: "first", baseURL: "https://first.example.test/v1", apiKey: "a", modelId: "model-a", supportsStructuredOutputs: true, fetch: firstFetch }),
      createOpenAICompatibleModelGateway({ providerName: "second", baseURL: "https://second.example.test/v1", apiKey: "b", modelId: "model-b", supportsStructuredOutputs: true, fetch: secondFetch }),
    ];
    const results = await Promise.all(gateways.map((gateway) => gateway.generate<{ schema_version: string; answer: string }>({
      operation: "test",
      schemaVersion: "test.v1",
      schema,
      instructions: "x",
      input: {},
      signal: new AbortController().signal,
      timeoutMs: 1_000,
    })));
    expect(results).toEqual([
      { ok: true, value: { schema_version: "test.v1", answer: "first" }, finishReason: "stop" },
      { ok: true, value: { schema_version: "test.v1", answer: "second" }, finishReason: "stop" },
    ]);
    expect(String(firstFetch.mock.calls[0]?.[0])).toContain("first.example.test");
    expect(String(secondFetch.mock.calls[0]?.[0])).toContain("second.example.test");
  });
});
