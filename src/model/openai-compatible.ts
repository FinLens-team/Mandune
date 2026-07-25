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

export function createOpenAICompatibleModelGateway(
  config: OpenAICompatibleModelGatewayConfig,
): ModelGateway {
  const configured = validServerConfig(config);
  const provider = configured
    ? createOpenAICompatible({
        name: config.providerName,
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        supportsStructuredOutputs: config.supportsStructuredOutputs,
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
        const result = await generateText({
          model: provider(config.modelId),
          instructions: request.instructions,
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
          temperature: 0,
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
