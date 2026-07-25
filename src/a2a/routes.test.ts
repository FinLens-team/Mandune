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
      error: { code: "private_payload_rejected", message: "A2A input rejected" },
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
      error: { code: "private_payload_rejected", message: "A2A input rejected" },
    });
    expect(deepRunner.run).not.toHaveBeenCalled();
  });
});
