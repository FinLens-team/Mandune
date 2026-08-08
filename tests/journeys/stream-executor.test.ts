import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamingAnalysisExecutor } from "../../src/app/server/index.js";
import type { MarketEvidenceSource } from "../../src/analysis/index.js";
import type { EvidenceRecord, TaskEvent } from "../../src/contracts/index.js";
import { getFixture } from "../../src/fixtures/index.js";
import type { ModelGateway, ModelGatewayResult, ModelStreamRequest } from "../../src/model/index.js";
import type { ThemeId } from "../../src/theme/index.js";

const NOW = new Date("2026-07-25T09:00:00.000Z");
const SAFE_RATIONAL = "#市场概览\n\n当前证据支持继续观察组合变化。\n\n##风险边界\n\n部分持仓证据仍有缺口，应等待数据确认，并保留最终判断权。";
const SAFE_PERSONA = "我用当前角色口吻讲清同一组事实、风险和未知。";

function modelReports(rational: string, persona = SAFE_PERSONA): string {
  return [
    "<!-- MANDONG_RATIONAL_REPORT_START -->",
    rational,
    "<!-- MANDONG_RATIONAL_REPORT_END -->",
    "<!-- MANDONG_PERSONA_REPORT_START -->",
    persona,
    "<!-- MANDONG_PERSONA_REPORT_END -->",
  ].join("\n");
}

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
  now?: Date;
  onText?: (text: string) => void;
  themeId?: ThemeId;
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
    snapshot: {
      ...structuredClone(getFixture("supported_full").snapshot),
      ...(input.themeId ? { theme_id: input.themeId } : {}),
    },
    emit: (stage, state, extra) => events.push({
      stage,
      state,
      ...(extra?.message !== undefined ? { message: extra.message } : {}),
    }),
    now: () => new Date(input.now ?? NOW),
    onText: input.onText,
  });
  return { result, events };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StreamingAnalysisExecutor", () => {
  it("validates one model report while streaming only heading progress", async () => {
    const clientText = vi.fn();
    const requests: ModelStreamRequest[] = [];
    const modelGateway = gateway(async (request) => {
      requests.push(request);
      request.onConnected?.();
      request.onReasoningStarted?.();
      const text = modelReports(SAFE_RATIONAL, `#角色观察\n\n${SAFE_PERSONA}`);
      for (const delta of [text.slice(0, 8), text.slice(8, 64), text.slice(64)]) request.onText(delta);
      return { ok: true, text };
    });

    const { result, events } = await execute({ modelGateway, onText: clientText });

    expect(requests).toHaveLength(1);
    expect(clientText).toHaveBeenNthCalledWith(1, "# 市场概览\n");
    expect(clientText).toHaveBeenNthCalledWith(2, "# 风险边界\n");
    expect(result).toMatchObject({
      ai_text: SAFE_RATIONAL,
      ai_theme_text: `#角色观察\n\n${SAFE_PERSONA}`,
      source: { kind: "live", is_live: true },
    });
    expect(events
      .filter((event) => event.stage === "form_conclusions_and_advice" && event.state === "running")
      .map((event) => event.message)
    ).toEqual([
      "正在连接模型服务",
      "模型服务已连接，正在生成复盘",
      "模型正在推理并核对证据",
      "正在生成 市场概览",
      "正在生成 风险边界",
      "正在生成 角色观察",
    ]);
    expect(requests[0]?.maxOutputTokens).toBe(16_384);
    expect(requests[0]?.prompt).toContain("【时间边界】");
    expect(requests[0]?.prompt).toContain("报告生成日：2026-07-25（星期六）");
    expect(requests[0]?.prompt).toContain("最近完整交易日：2026-07-24");
    expect(requests[0]?.prompt).toContain("今天是星期六，A股市场休市，没有同日涨跌；以下使用最近完整交易日的数据");
    expect(requests[0]?.instructions).not.toContain("不得使用“可惜”“糊弄”“别想蒙混”");
    expect(requests[0]?.instructions).toContain("免责声明统一由产品界面展示一次");
    expect(events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "running",
      message: "正在生成 市场概览",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "running",
      message: "正在生成 风险边界",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      stage: "discover_and_verify_events",
      state: "failed",
    }));
  });

  it("gives the model explicit Sunday market context", async () => {
    const requests: ModelStreamRequest[] = [];
    await execute({
      now: new Date("2026-07-26T09:00:00.000Z"),
      modelGateway: gateway(async (request) => {
        requests.push(request);
        const text = modelReports(SAFE_RATIONAL);
        request.onText(text);
        return { ok: true, text };
      }),
    });

    expect(requests[0]?.prompt).toContain("报告生成日：2026-07-26（星期日）");
    expect(requests[0]?.prompt).toContain("最近完整交易日：2026-07-24");
    expect(requests[0]?.prompt).toContain("今天是星期日，A股市场休市，没有同日涨跌；以下使用最近完整交易日的数据");
  });

  it.each([
    "建议卖出一万元并等待。",
    "建议减仓一百份并等待。",
    "建议在目标价三千点执行交易。",
    "建议明天卖出。",
    "这样可以保证收益。",
  ])("does not block page progression based on generated wording: %s", async (text) => {
    const clientText = vi.fn();
    const streamGenerate = vi.fn(successfulStream(modelReports(text)));

    const { result, events } = await execute({
      modelGateway: gateway(streamGenerate),
      onText: clientText,
    });

    expect(streamGenerate).toHaveBeenCalledTimes(1);
    expect(result.ai_text).toBe(text);
    expect(result.ai_theme_text).toBe(SAFE_PERSONA);
    expect(result.analysis.status).not.toBe("unavailable");
    expect(result.source.kind).toBe("live");
    expect(events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "succeeded",
    }));
  });

  it("uses an unbounded upstream Markdown response instead of rejecting it", async () => {
    const { result, events } = await execute({
      modelGateway: gateway(successfulStream(SAFE_RATIONAL)),
    });

    expect(result.ai_text).toBe(SAFE_RATIONAL);
    expect(result.ai_theme_text).toBe(SAFE_RATIONAL);
    expect(result.analysis.status).not.toBe("unavailable");
    expect(events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "succeeded",
    }));
  });

  it("fails only when the model returns no report text", async () => {
    const { result, events } = await execute({
      modelGateway: gateway(successfulStream("  \n")),
    });

    expect(result.ai_text).toBeUndefined();
    expect(result.analysis.status).toBe("unavailable");
    expect(events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "failed",
      message: "模型没有返回可展示的分析正文。",
    }));
  });

  it("keeps progressing when bounded report sections are incomplete", async () => {
    const incomplete = [
      "<!-- MANDONG_RATIONAL_REPORT_START -->",
      SAFE_RATIONAL,
      "<!-- MANDONG_RATIONAL_REPORT_END -->",
    ].join("\n");
    const { result, events } = await execute({
      modelGateway: gateway(successfulStream(incomplete)),
    });

    expect(result.ai_text).toBe(incomplete);
    expect(result.ai_theme_text).toBe(incomplete);
    expect(result.analysis.status).not.toBe("unavailable");
    expect(events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "succeeded",
    }));
  });

  it.each([
    ["eastern_observation", "奶龙", "你是**奶龙**", "我是龙"],
    ["jixing_doudou", "兜兜", "自称统一用「贫道」", "吉星高照"],
    ["sunge", "孙哥", "兄弟们", "孙哥"],
    ["zhouli", "周礼", "大周礼时代", "周礼"],
    ["tieba_laoge", "贴吧老哥", "攻击性、性别羞辱、脏话", "贴吧老哥"],
    ["male_succubus", "男魅魔", "成年男性魅魔", "男魅魔"],
    ["female_succubus", "女魅魔", "成年女性魅魔", "女魅魔"],
  ] as const)("loads the %s persona skill in the same model call", async (themeId, label, skillPhrase, themeLabel) => {
    const requests: ModelStreamRequest[] = [];
    const modelGateway = gateway(async (request) => {
      requests.push(request);
      const text = modelReports(SAFE_RATIONAL, `# ${label}复盘\n\n角色正文。`);
      request.onText(text);
      return { ok: true, text };
    });

    const { result, events } = await execute({ modelGateway, themeId });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.instructions).toContain(skillPhrase);
    expect(result.ai_text).toBe(SAFE_RATIONAL);
    expect(result.ai_theme_text).toContain(`${label}复盘`);
    expect(events).toContainEqual(expect.objectContaining({
      stage: "render_theme_and_validate_output",
      state: "running",
      message: `校验“${themeLabel}”主题表达。`,
    }));
  });

  it.each([
    "组合约占百分之三十，继续观察即可。",
    "记录中的收盘价为三千点，仅用于回顾证据。",
    "未来可能上涨，也可能下跌，仍需结合风险承受能力。",
    "当前不建议立即加仓。",
  ])("allows ordinary analysis wording without rejecting the report: %s", async (text) => {
    const { result } = await execute({
      modelGateway: gateway(successfulStream(modelReports(text))),
    });

    expect(result.ai_text).toBe(text);
    expect(result.analysis.status).not.toBe("unavailable");
  });

  it("redacts holding names and symbols from streamed and persisted heading progress", async () => {
    const clientText = vi.fn();
    const holding = getFixture("supported_full").snapshot.lines[0]!;
    const text = modelReports(`# ${holding.name} ${holding.symbol} 对比\n\n继续观察。`);
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
    const streamGenerate = vi.fn(successfulStream(modelReports(SAFE_RATIONAL)));

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
          const text = modelReports(SAFE_RATIONAL);
          request.onText(text);
          resolve({ ok: true, text });
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
