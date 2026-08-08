import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, jsonSchema, NoObjectGeneratedError, Output, streamText } from "ai";
import type {
  ModelGateway,
  ModelGatewayRequest,
  ModelGatewayResult,
  ModelStreamRequest,
  ModelStreamResult,
} from "./gateway.js";
import { hasPrivatePayload } from "./privacy.js";

export interface OpenAICompatibleModelGatewayConfig {
  providerName: string;
  baseURL: string;
  apiKey: string;
  modelId: string;
  /** Must only be true after a capability test against this provider/model. */
  supportsStructuredOutputs: boolean;
  fetch?: typeof fetch;
}

function validServerConfig(config: OpenAICompatibleModelGatewayConfig): boolean {
  if (!config.providerName.trim() || !config.apiKey || !config.modelId.trim()) return false;
  // The Demo streaming path does not require provider-side structured outputs;
  // the strict generate() path guards on this flag per request instead.
  try {
    const url = new URL(config.baseURL);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function failureFrom(error: unknown, signal: AbortSignal, timedOut: boolean): ModelGatewayResult<never> {
  if (signal.aborted) return { ok: false, code: "cancelled", retryable: false };
  if (timedOut) return { ok: false, code: "timeout", retryable: true };
  if (NoObjectGeneratedError.isInstance(error)) {
    return { ok: false, code: "malformed_output", retryable: true };
  }
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  if (name.includes("timeout")) return { ok: false, code: "timeout", retryable: true };
  return { ok: false, code: "provider_failure", retryable: true };
}

/**
 * The official DeepSeek stream contains `reasoning_content` chunks before
 * regular `content`. Current ai-sdk OpenAI-compatible parsing can discard the
 * entire response for this dialect. Consume its public SSE dialect directly,
 * forwarding only final answer content across the privacy boundary.
 */
async function streamOfficialDeepSeek(
  config: OpenAICompatibleModelGatewayConfig,
  request: ModelStreamRequest,
  signal: AbortSignal,
): Promise<ModelStreamResult> {
  const endpoint = new URL("chat/completions", `${config.baseURL.replace(/\/$/, "")}/`);
  const response = await (config.fetch ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.modelId,
      messages: [
        { role: "system", content: request.instructions },
        { role: "user", content: request.prompt },
      ],
      stream: true,
      temperature: 0.4,
      max_tokens: request.maxOutputTokens ?? 8_192,
      // The report consumes final prose only. Disabling hidden thinking prevents
      // DeepSeek from exhausting the output budget before it emits any content.
      thinking: { type: "disabled" },
    }),
    signal,
  });
  if (!response.ok || !response.body) return { ok: false, code: "provider_failure", retryable: true };
  request.onConnected?.();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const consume = (line: string): void => {
    if (!line.startsWith("data: ")) return;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown } }> };
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        text += delta;
        request.onText(delta);
      }
    } catch { /* ignore a malformed individual SSE chunk; EOF decides success */ }
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
    if (done) break;
  }
  if (buffer) consume(buffer);
  return text.trim()
    ? { ok: true, text }
    : { ok: false, code: "malformed_output", retryable: true };
}

export function createOpenAICompatibleModelGateway(
  config: OpenAICompatibleModelGatewayConfig,
): ModelGateway {
  const configured = validServerConfig(config);
  const deepSeekOfficial = configured && new URL(config.baseURL).hostname === "api.deepseek.com";
  const provider = configured
    ? createOpenAICompatible({
        name: config.providerName,
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        supportsStructuredOutputs: config.supportsStructuredOutputs,
        ...(deepSeekOfficial ? {
          // Structured JSON calls need a final schema-conforming object, not a
          // hidden reasoning trace that can consume the entire output budget.
          // The free-text stream uses the same setting in streamOfficialDeepSeek.
          transformRequestBody: (body: Record<string, unknown>) => ({
            ...body,
            thinking: { type: "disabled" },
          }),
        } : {}),
        ...(config.fetch ? { fetch: config.fetch } : {}),
      })
    : undefined;

  return {
    async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
      if (!provider) {
        return { ok: false, code: "configuration_unavailable", retryable: false };
      }
      if (request.signal.aborted) {
        return { ok: false, code: "cancelled", retryable: false };
      }
      if (hasPrivatePayload(request.input)) {
        return { ok: false, code: "privacy_violation", retryable: false };
      }
      if (!request.operation.trim() || !request.schemaVersion.trim() || request.timeoutMs <= 0) {
        return { ok: false, code: "configuration_unavailable", retryable: false };
      }

      const timeoutController = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
      }, request.timeoutMs);
      const combinedSignal = AbortSignal.any([request.signal, timeoutController.signal]);
      try {
        const structuredInstructions = config.supportsStructuredOutputs
          ? request.instructions
          : [
              request.instructions,
              "Return json only. The response must match this JSON Schema exactly:",
              JSON.stringify(request.schema),
            ].join("\n\n");
        const result = await generateText({
          model: provider(config.modelId),
          instructions: structuredInstructions,
          prompt: JSON.stringify({
            schema_version: request.schemaVersion,
            input: request.input,
          }),
          output: Output.object<T>({
            schema: jsonSchema<T>(request.schema as never),
            name: request.operation,
          }),
          abortSignal: combinedSignal,
          timeout: request.timeoutMs,
          maxRetries: 0,
          temperature: request.temperature ?? 0,
          ...(request.maxOutputTokens !== undefined
            ? { maxOutputTokens: request.maxOutputTokens }
            : {}),
          include: {
            requestBody: false,
            requestMessages: false,
            responseBody: false,
          },
        });

        const value = result.output;
        if (
          typeof value !== "object" ||
          value === null ||
          (value as { schema_version?: unknown }).schema_version !== request.schemaVersion
        ) {
          return { ok: false, code: "malformed_output", retryable: true };
        }
        if (hasPrivatePayload(value)) {
          return { ok: false, code: "privacy_violation", retryable: false };
        }
        return { ok: true, value, finishReason: result.finishReason };
      } catch (error) {
        return failureFrom(error, request.signal, timedOut);
      } finally {
        clearTimeout(timeout);
      }
    },

    async streamGenerate(request: ModelStreamRequest): Promise<ModelStreamResult> {
      if (!provider) {
        return { ok: false, code: "configuration_unavailable", retryable: false };
      }
      if (request.signal.aborted) {
        return { ok: false, code: "cancelled", retryable: false };
      }
      if (!request.prompt.trim() || request.timeoutMs <= 0) {
        return { ok: false, code: "configuration_unavailable", retryable: false };
      }
      if (deepSeekOfficial) {
        try {
          return await streamOfficialDeepSeek(config, request, request.signal);
        } catch (error) {
          const failure = failureFrom(error, request.signal, false);
          return failure.ok
            ? { ok: false, code: "provider_failure", retryable: true }
            : { ok: false, code: failure.code, retryable: failure.retryable };
        }
      }

      const timeoutController = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
      }, request.timeoutMs);
      const combinedSignal = AbortSignal.any([request.signal, timeoutController.signal]);
      try {
        const result = streamText({
          model: provider(config.modelId),
          system: request.instructions,
          prompt: request.prompt,
          abortSignal: combinedSignal,
          maxRetries: 0,
          temperature: 0.4,
          maxOutputTokens: request.maxOutputTokens ?? 8_192,
          onChunk: ({ chunk }) => {
            request.onConnected?.();
            if (chunk.type === "reasoning-start") request.onReasoningStarted?.();
          },
        });
        let text = "";
        for await (const delta of result.textStream) {
          text += delta;
          request.onText(delta);
        }
        if (!text.trim()) {
          return { ok: false, code: "malformed_output", retryable: true };
        }
        return { ok: true, text };
      } catch (error) {
        const failure = failureFrom(error, request.signal, timedOut);
        // failureFrom always yields a failure branch; guard narrows the union.
        if (failure.ok) return { ok: false, code: "provider_failure", retryable: true };
        return { ok: false, code: failure.code, retryable: failure.retryable };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
