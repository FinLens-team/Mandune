import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamingAnalysisExecutor } from "../../src/app/server/index.js";
import type { MarketEvidenceSource } from "../../src/analysis/index.js";
import type { EvidenceRecord, TaskEvent } from "../../src/contracts/index.js";
import { getFixture } from "../../src/fixtures/index.js";
import type { ModelGateway, ModelGatewayResult, ModelStreamRequest } from "../../src/model/index.js";

const NOW = new Date("2026-07-25T09:00:00.000Z");
const SAFE_RATIONAL = "# 今日分析\n\n当前证据支持继续观察组合变化。\n\n## 对比分析\n\n部分持仓证据仍有缺口，应等待数据确认，并保留最终判断权。";

function marketEvidence(request: Parameters<MarketEvidenceSource["collectMarketEvidence"]>[0]): EvidenceRecord[] {
  return [{
    id: `close-${request.lineId}`,
    scope: { kind: "asset", line_id: request.lineId, symbol: request.symbol },
    metric_or_event_type: "close",
    value: "已核验收盘观察值",
    unit: "CNY",
    source: { name: "test-market", locator: `test:${request.lineId}` },
    observation_or_event_time: request.latestCompleteTradingDay,
    fetched_at: request.acquiredAt,
    status: "available",
    limitations: [],
    provenance: "observed",
  }];
}

function source(collect?: MarketEvidenceSource["collectMarketEvidence"]): MarketEvidenceSource {
  return {
    collectMarketEvidence: collect ?? (async (request) => marketEvidence(request)),
  };
}

function gateway(streamGenerate: NonNullable<ModelGateway["streamGenerate"]>): ModelGateway {
  return {
    async generate<T>(): Promise<ModelGatewayResult<T>> {
      return { ok: false, code: "configuration_unavailable", retryable: false };
    },
    streamGenerate,
  };
}

function successfulStream(text: string): NonNullable<ModelGateway["streamGenerate"]> {
  return async (request) => {
    request.onText(text);
    return { ok: true, text };
  };
}

async function execute(input: {
  modelGateway: ModelGateway;
  marketEvidenceSource?: MarketEvidenceSource;
  hardDeadlineMs?: number;
  onText?: (text: string) => void;
}) {
  const events: Array<Pick<TaskEvent, "stage" | "state"> & { message?: string }> = [];
  const executor = new StreamingAnalysisExecutor({
    modelGateway: input.modelGateway,
    marketEvidenceSource: input.marketEvidenceSource ?? source(),
  }, {
    hardDeadlineMs: input.hardDeadlineMs,
    marketTimeoutMs: 10_000,
    modelTimeoutMs: 10_000,
  });
  const result = await executor.execute({
    workspaceId: "workspace-stream-safety",
    analysisId: "analysis-stream-safety",
    snapshot: structuredClone(getFixture("supported_full").snapshot),
    emit: (stage, state, extra) => events.push({
      stage,
      state,
      ...(extra?.message !== undefined ? { message: extra.message } : {}),
    }),
    now: () => new Date(NOW),
    onText: input.onText,
  });
  return { result, events };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StreamingAnalysisExecutor production safety", () => {
  it("validates one model report while streaming only heading progress", async () => {
    const clientText = vi.fn();
    const requests: ModelStreamRequest[] = [];
    const modelGateway = gateway(async (request) => {
      requests.push(request);
      const text = SAFE_RATIONAL;
      for (const delta of [text.slice(0, 8), text.slice(8)]) request.onText(delta);
      return { ok: true, text };
    });

    const { result, events } = await execute({ modelGateway, onText: clientText });

    expect(requests).toHaveLength(1);
    expect(clientText).toHaveBeenNthCalledWith(1, "# 今日分析\n");
    expect(clientText).toHaveBeenNthCalledWith(2, "# 对比分析\n");
    expect(result).toMatchObject({
      ai_text: SAFE_RATIONAL,
      source: { kind: "live", is_live: true },
    });
    expect(result.ai_theme_text).toContain(`<!-- MANDONG_RATIONAL_REPORT_START -->\n${SAFE_RATIONAL}\n<!-- MANDONG_RATIONAL_REPORT_END -->`);
    expect(events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "running",
      message: "正在生成 今日分析",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "running",
      message: "正在生成 对比分析",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      stage: "discover_and_verify_events",
      state: "failed",
    }));
  });

  it.each([
    "建议卖出一万元并等待。",
    "建议减仓一百份并等待。",
    "建议在目标价三千点执行交易。",
    "建议明天卖出。",
    "这样可以保证收益。",
  ])("rejects forbidden generated content without exposing it: %s", async (unsafeText) => {
    const clientText = vi.fn();
    const streamGenerate = vi.fn(successfulStream(unsafeText));

    const { result, events } = await execute({
      modelGateway: gateway(streamGenerate),
      onText: clientText,
    });

    expect(streamGenerate).toHaveBeenCalledTimes(1);
    expect(clientText).not.toHaveBeenCalled();
    expect(result.ai_text).toBeUndefined();
    expect(result.ai_theme_text).toBeUndefined();
    expect(result.analysis.status).toBe("unavailable");
    expect(result.source.kind).toBe("unavailable");
    expect(events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "failed",
    }));
  });

  it.each([
    "组合约占百分之三十，继续观察即可。",
    "记录中的收盘价为三千点，仅用于回顾证据。",
    "未来可能上涨，也可能下跌，仍需结合风险承受能力。",
    "当前不建议立即加仓。",
  ])("allows ordinary analysis wording without rejecting the report: %s", async (text) => {
    const { result } = await execute({
      modelGateway: gateway(successfulStream(text)),
    });

    expect(result.ai_text).toBe(text);
    expect(result.analysis.status).not.toBe("unavailable");
  });

  it("redacts holding names and symbols from streamed and persisted heading progress", async () => {
    const clientText = vi.fn();
    const holding = getFixture("supported_full").snapshot.lines[0]!;
    const text = `# ${holding.name} ${holding.symbol} 对比\n\n继续观察。`;
    const { events } = await execute({
      modelGateway: gateway(successfulStream(text)),
      onText: clientText,
    });

    expect(clientText).toHaveBeenCalledWith("# 持仓分析\n");
    expect(events).toContainEqual(expect.objectContaining({ message: "正在生成 持仓分析" }));
    expect(JSON.stringify(events)).not.toContain(holding.name);
    expect(JSON.stringify(events)).not.toContain(holding.symbol);
  });

  it("aborts market collection at the whole-run deadline and never starts a model call", async () => {
    vi.useFakeTimers();
    let marketSignal: AbortSignal | undefined;
    const marketEvidenceSource = source((request) => {
      marketSignal = request.signal;
      return new Promise(() => undefined);
    });
    const streamGenerate = vi.fn(successfulStream(SAFE_RATIONAL));

    const pending = execute({
      modelGateway: gateway(streamGenerate),
      marketEvidenceSource,
      hardDeadlineMs: 50,
    });
    await vi.advanceTimersByTimeAsync(50);
    const { result, events } = await pending;

    expect(marketSignal?.aborted).toBe(true);
    expect(streamGenerate).not.toHaveBeenCalled();
    expect(result.analysis.status).toBe("unavailable");
    expect(events).toContainEqual(expect.objectContaining({
      stage: "fetch_structured_data",
      state: "timed_out",
    }));
  });

  it("isolates a late rational gateway result", async () => {
    vi.useFakeTimers();
    const clientText = vi.fn();
    const signals: AbortSignal[] = [];
    const streamGenerate = vi.fn((request: ModelStreamRequest) => {
      signals.push(request.signal);
      return new Promise<Awaited<ReturnType<NonNullable<ModelGateway["streamGenerate"]>>>>((resolve) => {
        setTimeout(() => {
          request.onText(SAFE_RATIONAL);
          resolve({ ok: true, text: SAFE_RATIONAL });
        }, 100);
      });
    });

    const pending = execute({
      modelGateway: gateway(streamGenerate),
      hardDeadlineMs: 50,
      onText: clientText,
    });
    await vi.advanceTimersByTimeAsync(50);
    const { result, events } = await pending;

    expect(streamGenerate).toHaveBeenCalledTimes(1);
    expect(signals[0]?.aborted).toBe(true);
    expect(clientText).not.toHaveBeenCalled();
    expect(result.ai_text).toBeUndefined();
    expect(result.analysis.status).toBe("unavailable");
    expect(events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "timed_out",
    }));

    await vi.advanceTimersByTimeAsync(50);
    expect(clientText).not.toHaveBeenCalled();
    expect(streamGenerate).toHaveBeenCalledTimes(1);
  });

});
