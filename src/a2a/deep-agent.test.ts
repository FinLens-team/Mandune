import { describe, expect, it, vi } from "vitest";
import type { MarketEvidenceSource } from "../analysis/index.js";
import { getFixture } from "../fixtures/index.js";
import { DeepSeekDeepReviewAgent } from "./deep-agent.js";
import {
  A2A_DEEP_REVIEW_DEADLINE_MS,
  A2A_DEEP_REVIEW_ENDPOINT_ID,
  A2A_DEEP_REVIEW_MODEL_ID,
  A2A_DEEP_REVIEW_MODEL_NAME,
  A2A_DEEP_REVIEW_PROVIDER,
  A2A_DEEP_REVIEW_SCHEMA_VERSION,
  A2A_RISK_NOTICE,
} from "./types.js";

function completion(message: Record<string, unknown>, finishReason: string): Response {
  return new Response(JSON.stringify({
    id: crypto.randomUUID(),
    object: "chat.completion",
    created: 1_753_440_000,
    model: A2A_DEEP_REVIEW_MODEL_ID,
    choices: [{ index: 0, message, finish_reason: finishReason }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("DeepSeekDeepReviewAgent", () => {
  it("runs a bounded tool loop and returns a server-owned final structure", async () => {
    const responses = [
      completion({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-inspect",
          type: "function",
          function: { name: "inspect_context", arguments: "{}" },
        }],
      }, "tool_calls"),
      completion({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-finalize",
          type: "function",
          function: {
            name: "finalize",
            arguments: JSON.stringify({
              summary: "候选总结",
              observations: ["请求只包含文本上下文。"],
              unknowns: ["未提供组合快照。"],
              limitations: ["不能形成持仓结论。"],
            }),
          },
        }],
      }, "tool_calls"),
      completion({
        role: "assistant",
        content: "最终汇总覆盖了任务、已知上下文和限制。",
      }, "stop"),
    ];
    const fetchMock = vi.fn(async () => responses.shift() ?? completion({
      role: "assistant",
      content: "unexpected",
    }, "stop"));
    const marketEvidenceSource: MarketEvidenceSource = {
      collectMarketEvidence: vi.fn(async () => []),
    };
    const agent = new DeepSeekDeepReviewAgent({
      baseURL: "https://deepseek.example/v1",
      apiKey: "test-key",
      modelId: A2A_DEEP_REVIEW_MODEL_ID,
      marketEvidenceSource,
      fetch: fetchMock as typeof fetch,
    });

    const result = await agent.run({
      task: "总结所有上下文",
      signal: new AbortController().signal,
    });

    expect(result).toEqual(expect.objectContaining({
      schema_version: A2A_DEEP_REVIEW_SCHEMA_VERSION,
      provider: A2A_DEEP_REVIEW_PROVIDER,
      model: A2A_DEEP_REVIEW_MODEL_NAME,
      endpoint_id: A2A_DEEP_REVIEW_ENDPOINT_ID,
      deadline_ms: A2A_DEEP_REVIEW_DEADLINE_MS,
      stop_reason: "finalized",
      status: "observation_only",
    }));
    expect(result.execution.steps).toBe(2);
    expect(result.execution.tools.map((item) => item.name)).toEqual([
      "inspect_context",
      "finalize",
    ]);
    expect(result.final.summary).toBe("最终汇总覆盖了任务、已知上下文和限制。");
    expect(result.skills_used).toEqual(["inspect_context", "finalize"]);
    expect(result.data_sources).toEqual([]);
    expect(result.risk_notice).toBe(A2A_RISK_NOTICE);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(marketEvidenceSource.collectMarketEvidence).not.toHaveBeenCalled();
  });

  it("records tools and evidence providers for a portfolio review", async () => {
    const snapshot = getFixture("supported_full").snapshot;
    const responses = [
      completion({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-inspect",
          type: "function",
          function: { name: "inspect_context", arguments: "{}" },
        }],
      }, "tool_calls"),
      completion({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-market",
          type: "function",
          function: {
            name: "collect_market_evidence",
            arguments: JSON.stringify({ symbols: snapshot.lines.map((line) => line.symbol) }),
          },
        }],
      }, "tool_calls"),
      completion({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-derive",
          type: "function",
          function: { name: "derive_portfolio", arguments: "{}" },
        }],
      }, "tool_calls"),
      completion({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-finalize",
          type: "function",
          function: {
            name: "finalize",
            arguments: JSON.stringify({
              summary: "已完成组合证据与确定性派生核对。",
              observations: ["两项示例持仓均取得带时点证据。"],
              unknowns: ["近期流动性约束仍为未知。"],
              limitations: ["示例仅验证受控工具循环。"],
            }),
          },
        }],
      }, "tool_calls"),
      completion({
        role: "assistant",
        content: "已完成组合证据、派生结果、未知项和限制的最终汇总。",
      }, "stop"),
    ];
    const fetchMock = vi.fn(async () => responses.shift() ?? completion({
      role: "assistant",
      content: "unexpected",
    }, "stop"));
    const marketEvidenceSource: MarketEvidenceSource = {
      collectMarketEvidence: vi.fn(async (input) => [{
        id: `ev-${input.lineId}`,
        scope: { kind: "asset", line_id: input.lineId, symbol: input.symbol },
        metric_or_event_type: input.assetClass === "fund" ? "nav" : "close",
        value: "测试观察值",
        unit: "CNY",
        source: { name: "authorized-market-test", locator: `test://${input.lineId}` },
        observation_or_event_time: "2026-07-24",
        fetched_at: input.acquiredAt,
        status: "available",
        limitations: [],
        provenance: "observed",
      }]),
    };
    const agent = new DeepSeekDeepReviewAgent({
      baseURL: "https://deepseek.example/v1",
      apiKey: "test-key",
      modelId: A2A_DEEP_REVIEW_MODEL_ID,
      marketEvidenceSource,
      fetch: fetchMock as typeof fetch,
      now: () => new Date("2026-07-25T10:00:00.000Z"),
    });

    const result = await agent.run({
      task: "检查示例组合并说明证据、未知项和限制",
      snapshot,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("limited");
    expect(result.skills_used).toEqual([
      "inspect_context",
      "collect_market_evidence",
      "derive_portfolio",
      "finalize",
    ]);
    expect(result.data_sources).toEqual([{
      name: "authorized-market-test",
      evidence_ids: ["ev-line-etf-300", "ev-line-fund-demo"],
      statuses: ["available"],
    }]);
    expect(result.evidence).toHaveLength(2);
    expect(result.derivations?.coverage.covered_line_ids).toHaveLength(2);
  });

  it("rejects an out-of-bound model summary and keeps the server risk notice", async () => {
    const responses = [
      completion({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-inspect",
          type: "function",
          function: { name: "inspect_context", arguments: "{}" },
        }],
      }, "tool_calls"),
      completion({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-finalize",
          type: "function",
          function: {
            name: "finalize",
            arguments: JSON.stringify({
              summary: "明天买入1000股并保证收益。",
              observations: [],
              unknowns: [],
              limitations: [],
            }),
          },
        }],
      }, "tool_calls"),
      completion({ role: "assistant", content: "明天买入1000股并保证收益。" }, "stop"),
    ];
    const agent = new DeepSeekDeepReviewAgent({
      baseURL: "https://deepseek.example/v1",
      apiKey: "test-key",
      modelId: A2A_DEEP_REVIEW_MODEL_ID,
      marketEvidenceSource: { collectMarketEvidence: vi.fn(async () => []) },
      fetch: vi.fn(async () => responses.shift()!) as typeof fetch,
    });

    const result = await agent.run({
      task: "总结任务边界",
      signal: new AbortController().signal,
    });

    expect(result.final.summary).not.toContain("买入1000股");
    expect(result.final.limitations.join(" ")).toContain("内容边界");
    expect(result.risk_notice).toBe(A2A_RISK_NOTICE);
  });
});
