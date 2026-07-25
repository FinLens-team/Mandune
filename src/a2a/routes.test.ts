import { describe, expect, it, vi } from "vitest";
import {
  A2A_DEEP_REVIEW_DEADLINE_MS,
  A2A_DEEP_REVIEW_ENDPOINT_ID,
  A2A_DEEP_REVIEW_MODEL_NAME,
  A2A_DEEP_REVIEW_PROVIDER,
  A2A_DEEP_REVIEW_SCHEMA_VERSION,
  A2A_RISK_NOTICE,
  type DeepReviewOutput,
  type DeepReviewRunner,
} from "./index.js";
import { createA2ARoutes } from "./routes.js";

const TOKEN = "test-a2a-bearer-token-at-least-24-chars";

function output(): DeepReviewOutput {
  return {
    schema_version: A2A_DEEP_REVIEW_SCHEMA_VERSION,
    status: "observation_only",
    provider: A2A_DEEP_REVIEW_PROVIDER,
    model: A2A_DEEP_REVIEW_MODEL_NAME,
    endpoint_id: A2A_DEEP_REVIEW_ENDPOINT_ID,
    started_at: "2026-07-25T10:00:00.000Z",
    completed_at: "2026-07-25T10:00:01.000Z",
    deadline_ms: A2A_DEEP_REVIEW_DEADLINE_MS,
    stop_reason: "finalized",
    context: {
      task: "总结测试上下文",
      snapshot_id: null,
      holdings: [],
      constraints: null,
    },
    evidence: [],
    skills_used: ["inspect_context", "finalize"],
    data_sources: [],
    derivations: null,
    final: {
      summary: "已完成无副作用的上下文总结。",
      observations: [],
      unknowns: ["未提供组合快照。"],
      limitations: [],
    },
    risk_notice: A2A_RISK_NOTICE,
    execution: { steps: 2, tools: [] },
  };
}

function runner(): DeepReviewRunner {
  return { run: vi.fn(async () => output()) };
}

describe("A2A deep review routes", () => {
  it("publishes a valid A2A 1.0 HTTP+JSON card without secrets", async () => {
    const app = createA2ARoutes({
      runner: runner(),
      bearerToken: TOKEN,
      publicBaseUrl: "https://demo.example.com",
    });
    const response = await app.request("http://localhost/.well-known/agent-card.json");
    const card = await response.json();

    expect(response.status).toBe(200);
    expect(card.supportedInterfaces).toEqual([{
      url: "https://demo.example.com/a2a",
      protocolBinding: "HTTP+JSON",
      protocolVersion: "1.0",
    }]);
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities).not.toHaveProperty("stateTransitionHistory");
    expect(card.securitySchemes).toEqual({
      bearerAuth: {
        httpAuthSecurityScheme: { scheme: "Bearer", bearerFormat: "opaque" },
      },
    });
    expect(card.securityRequirements).toEqual([{
      schemes: { bearerAuth: { list: [] } },
    }]);
    expect(card).not.toHaveProperty("security");
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0].examples).toHaveLength(3);
    expect(card.skills[0].tags).toContain("volcano-ark");
    expect(JSON.stringify(card)).not.toContain(TOKEN);
    expect(JSON.stringify(card)).not.toContain("API_KEY");
  });

  it("requires bearer auth and returns one A2A agent Message with text and data", async () => {
    const deepRunner = runner();
    const app = createA2ARoutes({ runner: deepRunner, bearerToken: TOKEN });
    const request = {
      message: {
        role: "ROLE_USER",
        messageId: "message-1",
        parts: [{ text: "总结测试上下文" }],
      },
      configuration: { acceptedOutputModes: ["text/plain", "application/json"] },
    };

    const unauthorized = await app.request("http://localhost/a2a/message:send", {
      method: "POST",
      headers: { "content-type": "application/a2a+json", "a2a-version": "1.0" },
      body: JSON.stringify(request),
    });
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({
      error: {
        code: 401,
        status: "UNAUTHENTICATED",
        message: "Bearer token required",
      },
    });

    const response = await app.request("http://localhost/a2a/message:send", {
      method: "POST",
      headers: {
        "content-type": "application/a2a+json",
        "a2a-version": "1.0",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(request),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/a2a+json");
    expect(body).toEqual({
      message: expect.objectContaining({
        role: "ROLE_AGENT",
        messageId: expect.any(String),
        contextId: expect.any(String),
        parts: [
          {
            text: `已完成无副作用的上下文总结。\n\n风险提示：${A2A_RISK_NOTICE}`,
            mediaType: "text/plain",
          },
          { data: output(), mediaType: "application/json" },
        ],
      }),
    });
    expect(body.message.metadata).toEqual({
      provider: A2A_DEEP_REVIEW_PROVIDER,
      model: A2A_DEEP_REVIEW_MODEL_NAME,
      endpointId: A2A_DEEP_REVIEW_ENDPOINT_ID,
    });
    expect(deepRunner.run).toHaveBeenCalledWith(expect.objectContaining({
      task: "总结测试上下文",
      signal: expect.any(AbortSignal),
    }));
  });

  it.each([
    "请总结本次任务的已知上下文、未知项和需要补充的信息，不要假设持仓。",
    "请检查已提交的体验组合，汇总证据、确定性派生、未知项与方向性观察。",
    "如果部分行情过期、不支持或失败，请明确降级状态、受影响判断和恢复动作。",
  ])("accepts documented example task: %s", async (task) => {
    const deepRunner = runner();
    const app = createA2ARoutes({ runner: deepRunner, bearerToken: TOKEN });
    const response = await app.request("http://localhost/a2a/message:send", {
      method: "POST",
      headers: {
        "content-type": "application/a2a+json",
        "a2a-version": "1.0",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        message: {
          role: "ROLE_USER",
          messageId: crypto.randomUUID(),
          parts: [{ text: task }],
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(deepRunner.run).toHaveBeenCalledWith(expect.objectContaining({ task }));
  });

  it("fails closed when a prompt contains a credential-shaped payload", async () => {
    const deepRunner = runner();
    const app = createA2ARoutes({ runner: deepRunner, bearerToken: TOKEN });
    const response = await app.request("http://localhost/a2a/message:send", {
      method: "POST",
      headers: {
        "content-type": "application/a2a+json",
        "a2a-version": "1.0",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        message: {
          role: "ROLE_USER",
          messageId: "message-2",
          parts: [{ text: "api_key=sk-this-must-not-enter-the-model" }],
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 400,
        status: "INVALID_ARGUMENT",
        message: "A2A input rejected",
        details: [{
          "@type": "type.googleapis.com/google.rpc.BadRequest",
          fieldViolations: [{ field: "message.parts", description: "private_payload_rejected" }],
        }],
      },
    });
    expect(deepRunner.run).not.toHaveBeenCalled();
  });

  it("rejects credential-shaped data before model execution", async () => {
    const deepRunner = runner();
    const app = createA2ARoutes({ runner: deepRunner, bearerToken: TOKEN });
    const response = await app.request("http://localhost/a2a/message:send", {
      method: "POST",
      headers: {
        "content-type": "application/a2a+json",
        "a2a-version": "1.0",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        message: {
          role: "ROLE_USER",
          messageId: "message-3",
          parts: [
            { text: "总结上下文" },
            { data: { api_key: "sk-this-must-not-enter-the-model" } },
          ],
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 400,
        status: "INVALID_ARGUMENT",
        message: "A2A input rejected",
        details: [{
          "@type": "type.googleapis.com/google.rpc.BadRequest",
          fieldViolations: [{ field: "message.parts", description: "private_payload_rejected" }],
        }],
      },
    });
    expect(deepRunner.run).not.toHaveBeenCalled();
  });

  it.each([undefined, "0.3", "1.0.1"])("rejects unsupported protocol version: %s", async (version) => {
    const deepRunner = runner();
    const app = createA2ARoutes({ runner: deepRunner, bearerToken: TOKEN });
    const response = await app.request("http://localhost/a2a/message:send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(version ? { "a2a-version": version } : {}),
      },
      body: JSON.stringify({
        message: { role: "ROLE_USER", messageId: "message-version", parts: [{ text: "测试" }] },
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 400,
        status: "FAILED_PRECONDITION",
        message: `A2A version ${version ?? "0.3"} is not supported`,
        details: [{
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "VERSION_NOT_SUPPORTED",
          domain: "a2a-protocol.org",
        }],
      },
    });
    expect(deepRunner.run).not.toHaveBeenCalled();
  });

  it("accepts the protocol version as a request parameter", async () => {
    const deepRunner = runner();
    const app = createA2ARoutes({ runner: deepRunner, bearerToken: TOKEN });
    const response = await app.request("http://localhost/a2a/message:send?A2A-Version=1.0", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        message: { role: "ROLE_USER", messageId: "message-query-version", parts: [{ text: "测试" }] },
      }),
    });

    expect(response.status).toBe(200);
    expect(deepRunner.run).toHaveBeenCalledOnce();
  });

  it("returns only an accepted output mode", async () => {
    const app = createA2ARoutes({ runner: runner(), bearerToken: TOKEN });
    const response = await app.request("http://localhost/a2a/message:send", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "a2a-version": "1.0" },
      body: JSON.stringify({
        message: { role: "ROLE_USER", messageId: "message-output", parts: [{ text: "测试" }] },
        configuration: { acceptedOutputModes: ["text/plain"] },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message.parts).toEqual([{
      text: `已完成无副作用的上下文总结。\n\n风险提示：${A2A_RISK_NOTICE}`,
      mediaType: "text/plain",
    }]);
  });

  it("rejects a push notification configuration when the capability is disabled", async () => {
    const deepRunner = runner();
    const app = createA2ARoutes({ runner: deepRunner, bearerToken: TOKEN });
    const response = await app.request("http://localhost/a2a/message:send", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "a2a-version": "1.0" },
      body: JSON.stringify({
        message: { role: "ROLE_USER", messageId: "message-push", parts: [{ text: "测试" }] },
        configuration: {
          taskPushNotificationConfig: { url: "https://callback.example.com/a2a" },
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 400,
        status: "FAILED_PRECONDITION",
        message: "This agent does not support push notifications",
        details: [{
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "PUSH_NOTIFICATION_NOT_SUPPORTED",
          domain: "a2a-protocol.org",
        }],
      },
    });
    expect(deepRunner.run).not.toHaveBeenCalled();
  });

  it("uses the standard A2A error shape for unsupported media types", async () => {
    const deepRunner = runner();
    const app = createA2ARoutes({ runner: deepRunner, bearerToken: TOKEN });
    const response = await app.request("http://localhost/a2a/message:send", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "a2a-version": "1.0" },
      body: JSON.stringify({
        message: {
          role: "ROLE_USER",
          messageId: "message-media",
          parts: [{ text: "测试", mediaType: "text/html" }],
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 400,
        status: "INVALID_ARGUMENT",
        message: "Media type text/html is not supported",
        details: [{
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "CONTENT_TYPE_NOT_SUPPORTED",
          domain: "a2a-protocol.org",
        }],
      },
    });
    expect(deepRunner.run).not.toHaveBeenCalled();
  });

  it("maps unexpected runner failures to an opaque internal error", async () => {
    const deepRunner: DeepReviewRunner = {
      run: vi.fn(async () => {
        throw new Error("sensitive downstream detail");
      }),
    };
    const app = createA2ARoutes({ runner: deepRunner, bearerToken: TOKEN });
    const response = await app.request("http://localhost/a2a/message:send", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "a2a-version": "1.0" },
      body: JSON.stringify({
        message: { role: "ROLE_USER", messageId: "message-failure", parts: [{ text: "测试" }] },
      }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: 500,
        status: "INTERNAL",
        message: "The agent could not complete the request",
      },
    });
  });
});
