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
    parts: unknown[];
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
      stateTransitionHistory: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" },
    },
    security: [{ bearerAuth: [] }],
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
      (typeof message.contextId !== "string" || !message.contextId.trim()))
  ) return null;
  return value as unknown as A2AMessageRequest;
}

function extractInput(message: A2AMessageRequest["message"]):
  | { ok: true; task: string; snapshot?: PortfolioSnapshot }
  | { ok: false; error: string } {
  const texts: string[] = [];
  let snapshot: PortfolioSnapshot | undefined;
  for (const part of message.parts) {
    if (!isObject(part)) return { ok: false, error: "invalid_part" };
    const choices = ["text", "data", "raw", "url"].filter((key) => part[key] !== undefined);
    if (choices.length !== 1) return { ok: false, error: "invalid_part" };
    if (choices[0] === "text") {
      if (typeof part.text !== "string") return { ok: false, error: "invalid_text_part" };
      texts.push(part.text);
    } else if (choices[0] === "data") {
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
      return { ok: false, error: "unsupported_part" };
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

export function createA2ARoutes(options: A2ARouteOptions): Hono {
  const app = new Hono();

  app.get("/.well-known/agent-card.json", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(agentCard(requestBaseUrl(c, options.publicBaseUrl)));
  });

  app.post("/a2a/message:send", async (c) => {
    if (!authorized(c, options.bearerToken)) {
      c.header("WWW-Authenticate", "Bearer");
      return protocolResponse(c, { error: { code: "unauthorized", message: "Bearer token required" } }, 401);
    }
    const contentLength = Number(c.req.header("content-length") ?? "0");
    if (contentLength > MAX_REQUEST_BYTES) {
      return protocolResponse(c, { error: { code: "request_too_large", message: "Request exceeds 1 MiB" } }, 413);
    }
    const raw = await c.req.text();
    if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) {
      return protocolResponse(c, { error: { code: "request_too_large", message: "Request exceeds 1 MiB" } }, 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return protocolResponse(c, { error: { code: "invalid_json", message: "Invalid JSON" } }, 400);
    }
    const request = parseMessage(body);
    if (!request) {
      return protocolResponse(c, { error: { code: "invalid_message", message: "Invalid A2A 1.0 message" } }, 400);
    }
    const extracted = extractInput(request.message);
    if (!extracted.ok) {
      return protocolResponse(c, { error: { code: extracted.error, message: "A2A input rejected" } }, 400);
    }
    const result = await options.runner.run({
      task: extracted.task,
      ...(extracted.snapshot ? { snapshot: extracted.snapshot } : {}),
      signal: c.req.raw.signal,
    });
    return protocolResponse(c, {
      message: {
        role: "ROLE_AGENT",
        messageId: crypto.randomUUID(),
        contextId: request.message.contextId ?? crypto.randomUUID(),
        parts: [
          {
            text: `${result.final.summary}\n\n风险提示：${A2A_RISK_NOTICE}`,
            mediaType: "text/plain",
          },
          { data: result, mediaType: "application/json" },
        ],
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
