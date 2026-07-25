import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamingAnalysisExecutor } from "../../src/app/server/index.js";
import type { MarketEvidenceSource } from "../../src/analysis/index.js";
import type { EvidenceRecord, TaskEvent } from "../../src/contracts/index.js";
import { getFixture } from "../../src/fixtures/index.js";
import type {
  ModelGateway,
  ModelGatewayResult,
  ModelStreamRequest,
} from "../../src/model/index.js";

const NOW = new Date("2026-07-25T09:00:00.000Z");
const SAFE_RATIONAL = "当前证据支持继续观察组合变化。部分持仓证据仍有缺口，应等待数据确认，并保留最终判断权。";

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

function themeFromPrompt(request: ModelStreamRequest): string {
  return request.prompt.slice(request.prompt.indexOf("\n") + 1);
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
  it("buffers the complete report, validates it, and emits it once after both model calls", async () => {
    const clientText = vi.fn();
    const requests: ModelStreamRequest[] = [];
    const modelGateway = gateway(async (request) => {
      requests.push(request);
      const text = requests.length === 1 ? SAFE_RATIONAL : themeFromPrompt(request);
      for (const delta of [text.slice(0, 8), text.slice(8)]) request.onText(delta);
      expect(clientText).not.toHaveBeenCalled();
      return { ok: true, text };
    });

    const { result, events } = await execute({ modelGateway, onText: clientText });

    expect(requests).toHaveLength(2);
    expect(requests[0]?.signal).toBe(requests[1]?.signal);
    expect(clientText).toHaveBeenCalledTimes(1);
    expect(clientText).toHaveBeenCalledWith(SAFE_RATIONAL);
    expect(result).toMatchObject({
      ai_text: SAFE_RATIONAL,
      source: { kind: "live", is_live: true },
    });
    expect(result.ai_theme_text).toContain(`<!-- MANDONG_RATIONAL_REPORT_START -->\n${SAFE_RATIONAL}\n<!-- MANDONG_RATIONAL_REPORT_END -->`);
    expect(events).toContainEqual(expect.objectContaining({
      stage: "discover_and_verify_events",
      state: "failed",
    }));
  });

  it.each([
    "建议卖出一万元并等待。",
    "建议减仓一百份并等待。",
    "建议把仓位调整为百分之三十。",
    "建议在目标价三千点执行交易。",
    "建议下周一开盘操作。",
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

  it("drops theme output when the rational body is changed while retaining safe rational text", async () => {
    const clientText = vi.fn();
    let call = 0;
    const modelGateway = gateway(async (request) => {
      call += 1;
      const text = call === 1
        ? SAFE_RATIONAL
        : themeFromPrompt(request).replace("继续观察组合变化", "未来一定上涨");
      request.onText(text);
      return { ok: true, text };
    });

    const { result, events } = await execute({ modelGateway, onText: clientText });

    expect(result.ai_text).toBe(SAFE_RATIONAL);
    expect(result.ai_theme_text).toBeUndefined();
    expect(result.source.kind).toBe("live");
    expect(clientText).toHaveBeenCalledOnce();
    expect(events).toContainEqual(expect.objectContaining({
      stage: "render_theme_and_validate_output",
      state: "failed",
    }));
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

  it("isolates a late rational gateway result and prevents the sequential theme call", async () => {
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

  it("aborts and isolates a late theme result under the same whole-run signal", async () => {
    vi.useFakeTimers();
    const clientText = vi.fn();
    const signals: AbortSignal[] = [];
    let call = 0;
    const streamGenerate = vi.fn((request: ModelStreamRequest) => {
      call += 1;
      signals.push(request.signal);
      if (call === 1) {
        request.onText(SAFE_RATIONAL);
        return Promise.resolve({ ok: true as const, text: SAFE_RATIONAL });
      }
      const theme = themeFromPrompt(request);
      return new Promise<Awaited<ReturnType<NonNullable<ModelGateway["streamGenerate"]>>>>((resolve) => {
        setTimeout(() => {
          request.onText(theme);
          resolve({ ok: true, text: theme });
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

    expect(streamGenerate).toHaveBeenCalledTimes(2);
    expect(signals[0]).toBe(signals[1]);
    expect(signals[1]?.aborted).toBe(true);
    expect(clientText).not.toHaveBeenCalled();
    expect(result.ai_text).toBeUndefined();
    expect(result.ai_theme_text).toBeUndefined();
    expect(result.analysis.status).toBe("unavailable");
    expect(events).toContainEqual(expect.objectContaining({
      stage: "render_theme_and_validate_output",
      state: "timed_out",
    }));

    await vi.advanceTimersByTimeAsync(50);
    expect(clientText).not.toHaveBeenCalled();
  });
});
