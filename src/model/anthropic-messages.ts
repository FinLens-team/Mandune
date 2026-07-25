import type {
  ModelGateway,
  ModelGatewayFailureCode,
  ModelGatewayRequest,
  ModelGatewayResult,
  ModelStreamRequest,
  ModelStreamResult,
} from "./gateway.js";
import { hasPrivatePayload } from "./privacy.js";

/**
 * Anthropic Messages 协议适配器。StepFun 的 step-explore 等推理模型不接受
 * OpenAI Chat Completions，只在 `/messages`（Anthropic 协议）上服务，但接受
 * `Authorization: Bearer`。此适配器用原生 fetch 直接对接该端点，保持
 * ModelGateway 契约不变：结构化 generate() 走 JSON 指令 + 文本解析，
 * streamGenerate() 用一次非流式请求把全文一次性交付（Demo 放宽路径足够）。
 */
export interface AnthropicMessagesModelGatewayConfig {
  providerName: string;
  baseURL: string;
  apiKey: string;
  modelId: string;
  fetch?: typeof fetch;
}

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}

interface AnthropicMessagesResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
}

function validServerConfig(config: AnthropicMessagesModelGatewayConfig): boolean {
  if (!config.providerName.trim() || !config.apiKey || !config.modelId.trim()) return false;
  try {
    const url = new URL(config.baseURL);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function messagesEndpoint(baseURL: string): string {
  return `${baseURL.replace(/\/+$/u, "")}/messages`;
}

/** Extract a single JSON object from model text, tolerating fences and prose. */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function collectText(response: AnthropicMessagesResponse): string {
  return (response.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
}

export function createAnthropicMessagesModelGateway(
  config: AnthropicMessagesModelGatewayConfig,
): ModelGateway {
  const configured = validServerConfig(config);
  const fetchImpl = config.fetch ?? fetch;

  async function callMessages(body: {
    system: string;
    prompt: string;
    maxOutputTokens: number;
    temperature: number;
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<
    | { ok: true; text: string; stopReason?: string }
    | { ok: false; code: ModelGatewayFailureCode; retryable: boolean }
  > {
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, body.timeoutMs);
    const combinedSignal = AbortSignal.any([body.signal, timeoutController.signal]);
    try {
      const response = await fetchImpl(messagesEndpoint(config.baseURL), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.modelId,
          max_tokens: body.maxOutputTokens,
          temperature: body.temperature,
          ...(body.system ? { system: body.system } : {}),
          messages: [{ role: "user", content: body.prompt }],
        }),
        signal: combinedSignal,
      });
      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 429;
        return { ok: false, code: "provider_failure", retryable };
      }
      const payload = (await response.json()) as AnthropicMessagesResponse;
      const text = collectText(payload);
      if (!text.trim()) return { ok: false, code: "malformed_output", retryable: true };
      return { ok: true, text, ...(payload.stop_reason ? { stopReason: payload.stop_reason } : {}) };
    } catch (error) {
      if (body.signal.aborted) return { ok: false, code: "cancelled", retryable: false };
      if (timedOut) return { ok: false, code: "timeout", retryable: true };
      const name = error instanceof Error ? error.name.toLowerCase() : "";
      if (name.includes("timeout")) return { ok: false, code: "timeout", retryable: true };
      return { ok: false, code: "provider_failure", retryable: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
      if (!configured) return { ok: false, code: "configuration_unavailable", retryable: false };
      if (request.signal.aborted) return { ok: false, code: "cancelled", retryable: false };
      if (hasPrivatePayload(request.input)) {
        return { ok: false, code: "privacy_violation", retryable: false };
      }
      if (!request.operation.trim() || !request.schemaVersion.trim() || request.timeoutMs <= 0) {
        return { ok: false, code: "configuration_unavailable", retryable: false };
      }

      const system = [
        request.instructions,
        "",
        "你必须只输出一个合法的 JSON 对象，不要输出任何解释文字、前后缀或 Markdown 代码围栏。",
        `该对象必须符合以下 JSON Schema，且字段 schema_version 必须严格等于 "${request.schemaVersion}"：`,
        JSON.stringify(request.schema),
      ].join("\n");
      const prompt = JSON.stringify({ schema_version: request.schemaVersion, input: request.input });

      const result = await callMessages({
        system,
        prompt,
        maxOutputTokens: request.maxOutputTokens ?? 4_096,
        temperature: request.temperature ?? 0,
        signal: request.signal,
        timeoutMs: request.timeoutMs,
      });
      if (!result.ok) return { ok: false, code: result.code, retryable: result.retryable };

      const value = extractJsonObject(result.text);
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
      // Anthropic end_turn maps to a clean OpenAI-style "stop" finish.
      const finishReason = result.stopReason === "end_turn" ? "stop" : result.stopReason;
      return { ok: true, value: value as T, ...(finishReason ? { finishReason } : {}) };
    },

    async streamGenerate(request: ModelStreamRequest): Promise<ModelStreamResult> {
      if (!configured) return { ok: false, code: "configuration_unavailable", retryable: false };
      if (request.signal.aborted) return { ok: false, code: "cancelled", retryable: false };
      if (!request.prompt.trim() || request.timeoutMs <= 0) {
        return { ok: false, code: "configuration_unavailable", retryable: false };
      }
      const result = await callMessages({
        system: request.instructions,
        prompt: request.prompt,
        maxOutputTokens: 4_096,
        temperature: 0.4,
        signal: request.signal,
        timeoutMs: request.timeoutMs,
      });
      if (!result.ok) return { ok: false, code: result.code, retryable: result.retryable };
      request.onText(result.text);
      return { ok: true, text: result.text };
    },
  };
}
