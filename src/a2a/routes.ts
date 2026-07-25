import { timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { hasPrivatePayload } from "../model/privacy.js";
import { validatePortfolioSnapshot, type PortfolioSnapshot } from "../contracts/index.js";
import {
  A2A_DEEP_REVIEW_ENDPOINT_ID,
  A2A_DEEP_REVIEW_MODEL_NAME,
  A2A_DEEP_REVIEW_PROVIDER,
  A2A_PROTOCOL_VERSION,
  A2A_RISK_NOTICE,
  type DeepReviewRunner,
} from "./types.js";

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_TASK_CHARS = 4_000;
const SUPPORTED_OUTPUT_MODES = ["text/plain", "application/json"] as const;

export interface A2ARouteOptions {
  runner: DeepReviewRunner;
  bearerToken: string;
  publicBaseUrl?: string;
}

interface A2AMessageRequest {
  message: {
    role: "ROLE_USER";
    messageId: string;
    contextId?: string;
    taskId?: string;
    parts: unknown[];
  };
  configuration?: {
    acceptedOutputModes?: string[];
    taskPushNotificationConfig?: unknown;
  };
}

function secureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function authorized(c: Context, expectedToken: string): boolean {
  const header = c.req.header("authorization") ?? "";
  return header.startsWith("Bearer ") && secureEqual(header.slice(7), expectedToken);
}

function requestBaseUrl(c: Context, configured?: string): string {
  if (configured) return configured.replace(/\/+$/u, "");
  const url = new URL(c.req.url);
  const forwardedProto = c.req.header("x-forwarded-proto")?.trim().toLowerCase();
  if (forwardedProto === "http" || forwardedProto === "https") url.protocol = `${forwardedProto}:`;
  const forwardedHost = c.req.header("x-forwarded-host")?.trim() || c.req.header("host")?.trim();
  if (forwardedHost && !/[\r\n/@]/u.test(forwardedHost)) url.host = forwardedHost;
  return url.origin;
}

function agentCard(baseUrl: string) {
  return {
    name: "满懂深度复盘 Agent",
    description: "基于显式授权上下文执行最长 15 分钟的受控深度复盘，并输出可追溯终态结构。",
    version: "1.0.0",
    supportedInterfaces: [
      {
        url: `${baseUrl}/a2a`,
        protocolBinding: "HTTP+JSON",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    securitySchemes: {
      bearerAuth: {
        httpAuthSecurityScheme: { scheme: "Bearer", bearerFormat: "opaque" },
      },
    },
    securityRequirements: [{ schemes: { bearerAuth: { list: [] } } }],
    skills: [
      {
        id: "mandong-deep-review-v1",
        name: "满懂深度复盘",
        description: "检查一次性任务和可选组合快照，通过受控工具循环核对上下文并返回最终结构。",
        tags: ["portfolio-review", "evidence", "deepseek-pro", "volcano-ark"],
        examples: [
          "请总结本次任务的已知上下文、未知项和需要补充的信息，不要假设持仓。",
          "请检查已提交的体验组合，汇总证据、确定性派生、未知项与方向性观察。",
          "如果部分行情过期、不支持或失败，请明确降级状态、受影响判断和恢复动作。",
        ],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["text/plain", "application/json"],
      },
    ],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMessage(value: unknown): A2AMessageRequest | null {
  if (!isObject(value) || !isObject(value.message)) return null;
  const message = value.message;
  if (
    message.role !== "ROLE_USER" ||
    typeof message.messageId !== "string" ||
    !message.messageId.trim() ||
    !Array.isArray(message.parts) ||
    message.parts.length === 0 ||
    (message.contextId !== undefined &&
      (typeof message.contextId !== "string" || !message.contextId.trim())) ||
    (message.taskId !== undefined &&
      (typeof message.taskId !== "string" || !message.taskId.trim()))
  ) return null;
  if (value.configuration !== undefined) {
    if (!isObject(value.configuration)) return null;
    const modes = value.configuration.acceptedOutputModes;
    if (modes !== undefined &&
      (!Array.isArray(modes) || modes.some((mode) => typeof mode !== "string" || !mode.trim()))) {
      return null;
    }
  }
  return value as unknown as A2AMessageRequest;
}

function extractInput(message: A2AMessageRequest["message"]):
  | { ok: true; task: string; snapshot?: PortfolioSnapshot }
  | { ok: false; error: string; unsupportedMediaType?: string } {
  const texts: string[] = [];
  let snapshot: PortfolioSnapshot | undefined;
  for (const part of message.parts) {
    if (!isObject(part)) return { ok: false, error: "invalid_part" };
    const choices = ["text", "data", "raw", "url"].filter((key) => part[key] !== undefined);
    if (choices.length !== 1) return { ok: false, error: "invalid_part" };
    if (part.mediaType !== undefined && typeof part.mediaType !== "string") {
      return { ok: false, error: "invalid_media_type" };
    }
    const mediaType = typeof part.mediaType === "string"
      ? part.mediaType.split(";", 1)[0]!.trim().toLowerCase()
      : undefined;
    if (choices[0] === "text") {
      if (mediaType && mediaType !== "text/plain") {
        return { ok: false, error: "unsupported_media_type", unsupportedMediaType: mediaType };
      }
      if (typeof part.text !== "string") return { ok: false, error: "invalid_text_part" };
      texts.push(part.text);
    } else if (choices[0] === "data") {
      if (mediaType && mediaType !== "application/json") {
        return { ok: false, error: "unsupported_media_type", unsupportedMediaType: mediaType };
      }
      if (!isObject(part.data)) return { ok: false, error: "invalid_data_part" };
      if (hasPrivatePayload(part.data)) return { ok: false, error: "private_payload_rejected" };
      if (Object.keys(part.data).some((key) => key !== "snapshot")) {
        return { ok: false, error: "unsupported_data" };
      }
      if (part.data.snapshot !== undefined) {
        if (snapshot) return { ok: false, error: "duplicate_snapshot" };
        const checked = validatePortfolioSnapshot(part.data.snapshot);
        if (!checked.ok) return { ok: false, error: "invalid_snapshot" };
        snapshot = checked.value;
      }
    } else {
      return {
        ok: false,
        error: "unsupported_media_type",
        unsupportedMediaType: mediaType ?? choices[0]!,
      };
    }
  }
  const task = texts.join("\n").trim();
  if (!task || [...task].length > MAX_TASK_CHARS) return { ok: false, error: "invalid_task" };
  if (hasPrivatePayload(task)) return { ok: false, error: "private_payload_rejected" };
  return { ok: true, task, ...(snapshot ? { snapshot } : {}) };
}

function protocolResponse(c: Context, body: unknown, status = 200): Response {
  return c.body(JSON.stringify(body), status as 200, {
    "Content-Type": "application/a2a+json; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

function protocolError(
  c: Context,
  status: number,
  canonicalStatus: string,
  message: string,
  details: unknown[] = [],
): Response {
  return protocolResponse(c, {
    error: {
      code: status,
      status: canonicalStatus,
      message,
      ...(details.length > 0 ? { details } : {}),
    },
  }, status);
}

function a2aError(
  c: Context,
  canonicalStatus: "FAILED_PRECONDITION" | "INVALID_ARGUMENT",
  message: string,
  reason: string,
): Response {
  return protocolError(c, 400, canonicalStatus, message, [{
    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
    reason,
    domain: "a2a-protocol.org",
  }]);
}

function validationError(c: Context, message: string, field: string, description: string): Response {
  return protocolError(c, 400, "INVALID_ARGUMENT", message, [{
    "@type": "type.googleapis.com/google.rpc.BadRequest",
    fieldViolations: [{ field, description }],
  }]);
}

function requestedProtocolVersion(c: Context): string {
  const header = c.req.header("a2a-version")?.trim();
  const query = c.req.query("A2A-Version")?.trim();
  return header || query || "0.3";
}

function acceptedOutputModes(request: A2AMessageRequest): string[] | null {
  const requested = request.configuration?.acceptedOutputModes ?? [];
  if (requested.length === 0) return [...SUPPORTED_OUTPUT_MODES];
  const supported = requested.filter((mode) =>
    SUPPORTED_OUTPUT_MODES.includes(mode.toLowerCase() as typeof SUPPORTED_OUTPUT_MODES[number])
  );
  return supported.length > 0 ? [...new Set(supported.map((mode) => mode.toLowerCase()))] : null;
}

export function createA2ARoutes(options: A2ARouteOptions): Hono {
  const app = new Hono();

  app.get("/.well-known/agent-card.json", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(agentCard(requestBaseUrl(c, options.publicBaseUrl)));
  });

  app.post("/a2a/message:send", async (c) => {
    if (!authorized(c, options.bearerToken)) {
      c.header("WWW-Authenticate", "Bearer");
      return protocolError(c, 401, "UNAUTHENTICATED", "Bearer token required");
    }
    if (requestedProtocolVersion(c) !== A2A_PROTOCOL_VERSION) {
      return a2aError(
        c,
        "FAILED_PRECONDITION",
        `A2A version ${requestedProtocolVersion(c)} is not supported`,
        "VERSION_NOT_SUPPORTED",
      );
    }
    const contentLength = Number(c.req.header("content-length") ?? "0");
    if (contentLength > MAX_REQUEST_BYTES) {
      return protocolError(c, 413, "RESOURCE_EXHAUSTED", "Request exceeds 1 MiB");
    }
    const raw = await c.req.text();
    if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) {
      return protocolError(c, 413, "RESOURCE_EXHAUSTED", "Request exceeds 1 MiB");
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return validationError(c, "Invalid JSON payload", "$", "Request body must be valid JSON");
    }
    const request = parseMessage(body);
    if (!request) {
      return validationError(c, "Invalid A2A 1.0 message", "message", "A valid user message is required");
    }
    if (request.message.taskId) {
      return a2aError(
        c,
        "FAILED_PRECONDITION",
        "This agent does not support task continuation",
        "UNSUPPORTED_OPERATION",
      );
    }
    if (request.configuration?.taskPushNotificationConfig !== undefined) {
      return a2aError(
        c,
        "FAILED_PRECONDITION",
        "This agent does not support push notifications",
        "PUSH_NOTIFICATION_NOT_SUPPORTED",
      );
    }
    const outputModes = acceptedOutputModes(request);
    if (!outputModes) {
      return a2aError(
        c,
        "INVALID_ARGUMENT",
        "None of the requested output media types are supported",
        "CONTENT_TYPE_NOT_SUPPORTED",
      );
    }
    const extracted = extractInput(request.message);
    if (!extracted.ok) {
      if (extracted.error === "unsupported_media_type") {
        return a2aError(
          c,
          "INVALID_ARGUMENT",
          `Media type ${extracted.unsupportedMediaType ?? "unknown"} is not supported`,
          "CONTENT_TYPE_NOT_SUPPORTED",
        );
      }
      return validationError(c, "A2A input rejected", "message.parts", extracted.error);
    }
    let result;
    try {
      result = await options.runner.run({
        task: extracted.task,
        ...(extracted.snapshot ? { snapshot: extracted.snapshot } : {}),
        signal: c.req.raw.signal,
      });
    } catch {
      return protocolError(c, 500, "INTERNAL", "The agent could not complete the request");
    }
    const parts = [];
    if (outputModes.includes("text/plain")) {
      parts.push({
        text: `${result.final.summary}\n\n风险提示：${A2A_RISK_NOTICE}`,
        mediaType: "text/plain",
      });
    }
    if (outputModes.includes("application/json")) {
      parts.push({ data: result, mediaType: "application/json" });
    }
    return protocolResponse(c, {
      message: {
        role: "ROLE_AGENT",
        messageId: crypto.randomUUID(),
        contextId: request.message.contextId ?? crypto.randomUUID(),
        parts,
        metadata: {
          provider: A2A_DEEP_REVIEW_PROVIDER,
          model: A2A_DEEP_REVIEW_MODEL_NAME,
          endpointId: A2A_DEEP_REVIEW_ENDPOINT_ID,
        },
      },
    });
  });

  return app;
}

export { agentCard as buildAgentCard };
