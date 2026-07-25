import { describe, expect, it, vi } from "vitest";
import type { ModelGateway, ModelGatewayRequest, ModelGatewayResult } from "../../src/model/index.js";
import { createAnalysisOrchestrator, type RationalModelOutput, type ThemeModelOutput } from "../../src/analysis/index.js";
import { CUTOFF_AT, marketEvidence, snapshot, STARTED_AT, TRADING_DAY } from "./fixtures.js";
import { resultTitleForTheme } from "../../src/theme/index.js";

function successfulGateway(overrides: Partial<RationalModelOutput> = {}): ModelGateway {
  return {
    async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
      if (request.operation === "rational_analysis") {
        return {
          ok: true,
          value: {
            schema_version: "rational-analysis.v1",
            conclusions: [{
              id: "conclusion-1",
              statement: "已核验行情支持对当前组合保持观察。",
              provenance: "generated",
              refs: [{ ref_id: "market-line-1", kind: "evidence" }],
              affected_by_unknowns: false,
            }],
            advice: [{
              id: "advice-1",
              kind: "maintain_observation",
              statement: "维持观察并等待后续完整交易日证据。",
              trigger_refs: [{ ref_id: "market-line-1", kind: "evidence" }],
              urgency: "routine",
            }],
            assumptions: [],
            limitations: [],
            risk_notes: [{ id: "risk-1", statement: "结果不构成投资建议，用户保留最终判断。", is_boundary_notice: true }],
            ...overrides,
          } as T,
        };
      }
      return {
        ok: true,
        value: {
          schema_version: "theme-narrative.v1",
          rational_analysis_id: "analysis-1",
          theme_id: "eastern_observation",
          headline: resultTitleForTheme("eastern_observation"),
          body_paragraphs: ["已核验行情支持对当前组合保持观察。"],
          mascot_mood: "calm",
          guidance_summary: "维持观察并等待后续完整交易日证据。",
          conclusion_ids: ["conclusion-1"],
          advice_ids: ["advice-1"],
        } satisfies ThemeModelOutput as T,
      };
    },
  };
}

function orchestrator(gateway: ModelGateway, options: { deadlineMs?: number } = {}) {
  return createAnalysisOrchestrator({
    marketEvidenceSource: {
      collectMarketEvidence: async ({ lineId }) => [marketEvidence(lineId)],
    },
    eventEvidenceSource: { collectEventEvidence: async () => [] },
    modelGateway: gateway,
    createId: () => "analysis-1",
    now: () => new Date(STARTED_AT),
  }, {
    targetDurationMs: 90_000,
    hardDeadlineMs: options.deadlineMs ?? 180_000,
    maxModelAttempts: 2,
  });
}

describe("single-agent analysis orchestrator", () => {
  it("runs the eight real stages in order with one analysis id and private-safe events", async () => {
    const result = await orchestrator(successfulGateway()).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.analysis.status).toBe("supported");
    expect(result.analysis.analysis_id).toBe("analysis-1");
    expect(result.narrative?.rational_analysis_id).toBe("analysis-1");
    const runningStages = result.events.filter((event) => event.state === "running").map((event) => event.stage);
    expect(runningStages).toEqual([
      "validate_snapshot",
      "resolve_assets",
      "fetch_structured_data",
      "discover_and_verify_events",
      "derive_exposure_and_constraints",
      "form_conclusions_and_advice",
      "render_theme_and_validate_output",
      "persist_or_return",
    ]);
    expect(new Set(result.events.map((event) => event.analysis_id))).toEqual(new Set(["analysis-1"]));
    expect(result.events).toContainEqual(expect.objectContaining({
      stage: "derive_exposure_and_constraints",
      state: "succeeded",
      covered_count: 1,
    }));
    expect(JSON.stringify(result.events)).not.toContain("虚构甲公司");
    expect(result.timing).toMatchObject({ target_ms: 90_000, hard_deadline_ms: 180_000 });
    expect(Object.isFrozen(result.analysis)).toBe(true);
    expect(Object.isFrozen(result.analysis.evidence)).toBe(true);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(Object.isFrozen(result.events[0])).toBe(true);
  });

  it("emits a real retry and discards malformed, privacy-bearing, or exact-advice output", async () => {
    let calls = 0;
    const invalidThenValid: ModelGateway = {
      async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
        if (request.operation !== "rational_analysis") return successfulGateway().generate<T>(request);
        calls += 1;
        if (calls === 1) {
          return {
            ok: true,
            value: {
              schema_version: "rational-analysis.v1",
              conclusions: [{ id: "bad", statement: "secret", provenance: "generated", refs: [], affected_by_unknowns: false }],
              advice: [{ id: "bad", kind: "reduce_concentration", statement: "建议仓位降到 20%", trigger_refs: [], urgency: "attention" }],
              assumptions: [], limitations: [], risk_notes: [], account_number: "private",
            } as T,
          };
        }
        return successfulGateway().generate<T>(request);
      },
    };
    const result = await orchestrator(invalidThenValid).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });
    expect(result.analysis.status).toBe("supported");
    expect(result.events).toContainEqual(expect.objectContaining({ stage: "form_conclusions_and_advice", state: "retrying", retry_count: 1 }));
    expect(JSON.stringify(result)).not.toContain("建议仓位降到 20%");
    expect(JSON.stringify(result)).not.toContain("account_number");
  });

  it("rejects non-numeric buy or sell commands even when their references are otherwise valid", async () => {
    let calls = 0;
    const base = successfulGateway();
    const commandThenValid: ModelGateway = {
      async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
        if (request.operation !== "rational_analysis") return base.generate<T>(request);
        calls += 1;
        if (calls > 1) return base.generate<T>(request);
        return {
          ok: true,
          value: {
            schema_version: "rational-analysis.v1",
            conclusions: [{
              id: "conclusion-1",
              statement: "现有证据已完成核对。",
              provenance: "generated",
              refs: [{ ref_id: "market-line-1", kind: "evidence" }],
              affected_by_unknowns: false,
            }],
            advice: [{
              id: "advice-1",
              kind: "reduce_concentration",
              statement: "立即卖出该标的。",
              trigger_refs: [{ ref_id: "market-line-1", kind: "evidence" }],
              urgency: "attention",
            }],
            assumptions: [],
            limitations: [],
            risk_notes: [{
              id: "risk-1",
              statement: "结果不构成投资建议，用户保留最终判断。",
              is_boundary_notice: true,
            }],
          } as T,
        };
      },
    };

    const result = await orchestrator(commandThenValid).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.analysis.status).toBe("supported");
    expect(result.events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "retrying",
    }));
    expect(JSON.stringify(result)).not.toContain("立即卖出");
  });

  it("rejects evidence outside the requested snapshot line instead of exposing it to the model", async () => {
    const result = await createAnalysisOrchestrator({
      marketEvidenceSource: {
        collectMarketEvidence: async () => [marketEvidence("different-line")],
      },
      eventEvidenceSource: { collectEventEvidence: async () => [] },
      modelGateway: successfulGateway(),
      createId: () => "analysis-1",
      now: () => new Date(STARTED_AT),
    }).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.analysis.evidence.map((item) => item.id)).not.toContain("market-different-line");
    expect(result.analysis.evidence).toContainEqual(expect.objectContaining({
      id: "market-failed-line-1",
      status: "failed",
    }));
  });

  it.each([
    ["snapshot after analysis start", { snapshotCreatedAt: "2026-07-25T02:00:00.000Z", tradingDay: TRADING_DAY, cutoffAt: CUTOFF_AT }],
    ["trading day after evidence cutoff", { snapshotCreatedAt: "2026-07-24T23:00:00.000Z", tradingDay: "2026-07-26", cutoffAt: CUTOFF_AT }],
    ["evidence cutoff after analysis start", { snapshotCreatedAt: "2026-07-24T23:00:00.000Z", tradingDay: TRADING_DAY, cutoffAt: "2026-07-25T02:00:00.000Z" }],
  ])("fails closed when %s", async (_label, boundaries) => {
    const inputSnapshot = snapshot(1);
    inputSnapshot.created_at = boundaries.snapshotCreatedAt;
    const result = await orchestrator(successfulGateway()).run({
      snapshot: inputSnapshot,
      latestCompleteTradingDay: boundaries.tradingDay,
      evidenceCutoffAt: boundaries.cutoffAt,
    });

    expect(result.terminal_reason).toBe("invalid_input");
    expect(result.analysis.status).toBe("unavailable");
    expect(result.events).toContainEqual(expect.objectContaining({ stage: "validate_snapshot", state: "failed" }));
  });

  it("rejects secret-bearing source locators before evidence reaches the model", async () => {
    const secretEvidence = {
      ...marketEvidence("line-1"),
      source: {
        name: "unsafe source",
        locator: "https://source.example.test/item?token=secret-value",
      },
    };
    const generate = vi.fn();
    const base = successfulGateway();
    const gateway: ModelGateway = {
      async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
        generate(request);
        return base.generate<T>(request);
      },
    };
    const result = await createAnalysisOrchestrator({
      marketEvidenceSource: { collectMarketEvidence: async () => [secretEvidence] },
      eventEvidenceSource: { collectEventEvidence: async () => [] },
      modelGateway: gateway,
      createId: () => "analysis-1",
      now: () => new Date(STARTED_AT),
    }).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(generate).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("secret-value");
    expect(result.analysis.status).toBe("unavailable");
  });

  it("downgrades available close evidence with an unknown unit at the analysis boundary", async () => {
    const noUnit = { ...marketEvidence("line-1"), unit: undefined };
    const generate = vi.fn();
    const base = successfulGateway();
    const gateway: ModelGateway = {
      async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
        generate(request);
        return base.generate<T>(request);
      },
    };
    const result = await createAnalysisOrchestrator({
      marketEvidenceSource: { collectMarketEvidence: async () => [noUnit] },
      eventEvidenceSource: { collectEventEvidence: async () => [] },
      modelGateway: gateway,
      createId: () => "analysis-1",
      now: () => new Date(STARTED_AT),
    }).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.analysis.evidence).toContainEqual(expect.objectContaining({ id: "market-line-1", status: "ambiguous" }));
    expect(result.analysis.coverage.covered_line_ids).toEqual([]);
    expect(result.analysis.status).toBe("observation_only");
    expect(result.narrative).toBeUndefined();
    expect(generate).toHaveBeenCalled();
  });

  it("fails closed on duplicate evidence ids instead of silently choosing a version", async () => {
    const first = marketEvidence("line-1");
    const result = await createAnalysisOrchestrator({
      marketEvidenceSource: { collectMarketEvidence: async () => [first, { ...first, value: 11 }] },
      eventEvidenceSource: { collectEventEvidence: async () => [] },
      modelGateway: successfulGateway(),
      createId: () => "analysis-1",
      now: () => new Date(STARTED_AT),
    }).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.terminal_reason).toBe("model_failure");
    expect(result.analysis.status).toBe("unavailable");
    expect(result.analysis.evidence.map((item) => item.id)).not.toContain("market-line-1");
    expect(result.events).toContainEqual(expect.objectContaining({ stage: "fetch_structured_data", state: "failed" }));
  });

  it("rejects contract-external evidence fields before model input", async () => {
    const generate = vi.fn();
    const gateway: ModelGateway = {
      async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
        generate(request);
        return successfulGateway().generate<T>(request);
      },
    };
    const result = await createAnalysisOrchestrator({
      marketEvidenceSource: {
        collectMarketEvidence: async () => [{ ...marketEvidence("line-1"), provider_debug: "internal" } as never],
      },
      eventEvidenceSource: { collectEventEvidence: async () => [] },
      modelGateway: gateway,
      createId: () => "analysis-1",
      now: () => new Date(STARTED_AT),
    }).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(generate).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("provider_debug");
  });

  it("records event-source failure as typed evidence instead of silently dropping it", async () => {
    const result = await createAnalysisOrchestrator({
      marketEvidenceSource: {
        collectMarketEvidence: async ({ lineId }) => [marketEvidence(lineId)],
      },
      eventEvidenceSource: {
        collectEventEvidence: async () => {
          throw new Error("search unavailable");
        },
      },
      modelGateway: successfulGateway(),
      createId: () => "analysis-1",
      now: () => new Date(STARTED_AT),
    }).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.analysis.evidence).toContainEqual(expect.objectContaining({
      id: "event-failed-line-1",
      metric_or_event_type: "candidate_event",
      status: "failed",
      value: null,
    }));
  });

  it("marks date-old close evidence stale so it cannot support generated conclusions", async () => {
    const oldClose = {
      ...marketEvidence("line-1"),
      observation_or_event_time: "2026-07-23",
    };
    const result = await createAnalysisOrchestrator({
      marketEvidenceSource: { collectMarketEvidence: async () => [oldClose] },
      eventEvidenceSource: { collectEventEvidence: async () => [] },
      modelGateway: successfulGateway(),
      createId: () => "analysis-1",
      now: () => new Date(STARTED_AT),
    }).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.analysis.evidence).toContainEqual(expect.objectContaining({
      id: "market-line-1",
      status: "stale",
    }));
    expect(result.analysis.conclusions.every((item) => item.provenance !== "generated")).toBe(true);
    expect(result.analysis.status).toBe("observation_only");
  });

  it("degrades honestly after finite model failure and returns no partial generated text", async () => {
    const gateway: ModelGateway = {
      async generate() {
        return { ok: false, code: "provider_failure", retryable: true };
      },
    };
    const result = await orchestrator(gateway).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });
    expect(result.analysis.status).toBe("limited");
    expect(result.analysis.conclusions.every((item) => item.provenance !== "generated")).toBe(true);
    expect(result.narrative).toBeUndefined();
    expect(result.events.filter((event) => event.state === "retrying")).toHaveLength(1);
  });

  it("limits advice and marks conclusions when a personal constraint is unknown", async () => {
    const inputSnapshot = snapshot(1);
    inputSnapshot.constraints.near_term_liquidity = "unknown";
    let rationalCalls = 0;
    const safe = successfulGateway({
      conclusions: [{
        id: "conclusion-1",
        statement: "已核验行情支持对当前组合保持观察。",
        provenance: "generated",
        refs: [{ ref_id: "market-line-1", kind: "evidence" }],
        affected_by_unknowns: true,
        limited_by: ["near_term_liquidity 未知"],
      }],
      limitations: ["近期流动性需求未知，相关个性化判断已缩小。"],
    });
    const gateway: ModelGateway = {
      async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
        if (request.operation !== "rational_analysis") return safe.generate<T>(request);
        rationalCalls += 1;
        if (rationalCalls > 1) return safe.generate<T>(request);
        return {
          ok: true,
          value: {
            schema_version: "rational-analysis.v1",
            conclusions: [{
              id: "conclusion-1",
              statement: "已核验行情支持对当前组合保持观察。",
              provenance: "generated",
              refs: [{ ref_id: "market-line-1", kind: "evidence" }],
              affected_by_unknowns: false,
            }],
            advice: [{
              id: "advice-1",
              kind: "increase_liquidity_attention",
              statement: "提高可用资金关注度。",
              trigger_refs: [{ ref_id: "market-line-1", kind: "evidence" }],
              urgency: "attention",
            }],
            assumptions: [],
            limitations: [],
            risk_notes: [{ id: "risk-1", statement: "结果不构成投资建议，用户保留最终判断。", is_boundary_notice: true }],
          } as T,
        };
      },
    };

    const result = await orchestrator(gateway).run({
      snapshot: inputSnapshot,
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.analysis.status).toBe("limited");
    expect(result.analysis.conclusions).toContainEqual(expect.objectContaining({
      affected_by_unknowns: true,
      limited_by: ["near_term_liquidity 未知"],
    }));
    expect(result.analysis.advice.map((item) => item.kind)).toEqual(["maintain_observation"]);
    expect(result.events).toContainEqual(expect.objectContaining({ stage: "form_conclusions_and_advice", state: "retrying" }));
  });

  it("rejects a theme front that changes rational guidance and exposes no conflicting partial text", async () => {
    const base = successfulGateway();
    const conflicting: ModelGateway = {
      async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
        if (request.operation === "rational_analysis") return base.generate<T>(request);
        return {
          ok: true,
          value: {
            schema_version: "theme-narrative.v1",
            rational_analysis_id: "analysis-1",
            theme_id: "eastern_observation",
            headline: "冲突表达",
            body_paragraphs: ["立即卖出 100 股。"],
            mascot_mood: "urgent",
            guidance_summary: "立即卖出 100 股。",
            conclusion_ids: ["conclusion-1"],
            advice_ids: ["advice-1"],
          } as T,
        };
      },
    };
    const result = await orchestrator(conflicting).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });
    expect(result.analysis.status).toBe("limited");
    expect(result.narrative).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("立即卖出");
    expect(result.events).toContainEqual(expect.objectContaining({
      stage: "render_theme_and_validate_output",
      state: "retrying",
    }));
  });

  it("rejects a theme front that paraphrases or contradicts the rational conclusion", async () => {
    const base = successfulGateway();
    const conflicting: ModelGateway = {
      async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
        if (request.operation === "rational_analysis") return base.generate<T>(request);
        return {
          ok: true,
          value: {
            schema_version: "theme-narrative.v1",
            rational_analysis_id: "analysis-1",
            theme_id: "eastern_observation",
            headline: resultTitleForTheme("eastern_observation"),
            body_paragraphs: ["当前不宜继续观察。"],
            mascot_mood: "calm",
            guidance_summary: "维持观察并等待后续完整交易日证据。",
            conclusion_ids: ["conclusion-1"],
            advice_ids: ["advice-1"],
          } as T,
        };
      },
    };
    const result = await orchestrator(conflicting).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.analysis.status).toBe("limited");
    expect(result.narrative).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("当前不宜继续观察");
  });

  it("rejects harmless-looking additional model fields at runtime", async () => {
    let calls = 0;
    const base = successfulGateway();
    const extraThenValid: ModelGateway = {
      async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
        if (request.operation !== "rational_analysis") return base.generate<T>(request);
        calls += 1;
        const response = await base.generate<T>(request);
        if (calls > 1 || !response.ok) return response;
        return { ok: true, value: { ...(response.value as object), debug_note: "not part of the schema" } as T };
      },
    };
    const result = await orchestrator(extraThenValid).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.analysis.status).toBe("supported");
    expect(result.events).toContainEqual(expect.objectContaining({ stage: "form_conclusions_and_advice", state: "retrying" }));
    expect(JSON.stringify(result)).not.toContain("debug_note");
  });

  it("replays the same frozen request deterministically with injected ids, time, evidence, and model", async () => {
    const runner = orchestrator(successfulGateway());
    const request = {
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    };
    const first = await runner.run(request);
    const second = await runner.run(request);
    expect(first.analysis).toEqual(second.analysis);
    expect(first.narrative).toEqual(second.narrative);
    expect(first.events).toEqual(second.events);
  });

  it("cancels promptly and prevents a late provider result from changing the terminal result", async () => {
    let resolveLate!: (value: ReturnType<typeof marketEvidence>[]) => void;
    const late = new Promise<ReturnType<typeof marketEvidence>[]>((resolve) => { resolveLate = resolve; });
    const controller = new AbortController();
    const run = createAnalysisOrchestrator({
      marketEvidenceSource: { collectMarketEvidence: async () => late },
      eventEvidenceSource: { collectEventEvidence: async () => [] },
      modelGateway: successfulGateway(),
      createId: () => "analysis-1",
      now: () => new Date(STARTED_AT),
    }).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
      signal: controller.signal,
    });
    controller.abort();
    const result = await run;
    expect(result.analysis.status).toBe("unavailable");
    expect(result.terminal_reason).toBe("cancelled");
    resolveLate([marketEvidence("line-1")]);
    await Promise.resolve();
    expect(result.analysis.status).toBe("unavailable");
    expect(result.events.filter((event) => event.state === "cancelled")).toHaveLength(1);
  });

  it("marks the active model stage cancelled and aborts its request", async () => {
    let modelStarted!: () => void;
    const started = new Promise<void>((resolve) => { modelStarted = resolve; });
    let modelSignal: AbortSignal | undefined;
    const gateway: ModelGateway = {
      async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
        modelSignal = request.signal;
        modelStarted();
        return new Promise(() => undefined);
      },
    };
    const controller = new AbortController();
    const run = orchestrator(gateway).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
      signal: controller.signal,
    });
    await started;
    controller.abort();
    const result = await run;
    expect(modelSignal?.aborted).toBe(true);
    expect(result.terminal_reason).toBe("cancelled");
    expect(result.events).toContainEqual(expect.objectContaining({
      stage: "form_conclusions_and_advice",
      state: "cancelled",
    }));
  });

  it("enforces the hard deadline, aborts work, and isolates late responses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(STARTED_AT));
    try {
      let providerSignal: AbortSignal | undefined;
      const run = createAnalysisOrchestrator({
        marketEvidenceSource: {
          collectMarketEvidence: async ({ signal }) => {
            providerSignal = signal;
            return new Promise(() => undefined);
          },
        },
        eventEvidenceSource: { collectEventEvidence: async () => [] },
        modelGateway: successfulGateway(),
        createId: () => "analysis-1",
        now: () => new Date(Date.now()),
      }, { hardDeadlineMs: 180, targetDurationMs: 90 }).run({
        snapshot: snapshot(1),
        latestCompleteTradingDay: TRADING_DAY,
        evidenceCutoffAt: CUTOFF_AT,
      });
      await vi.advanceTimersByTimeAsync(180);
      const result = await run;
      expect(providerSignal?.aborted).toBe(true);
      expect(result.analysis.status).toBe("unavailable");
      expect(result.terminal_reason).toBe("deadline");
      expect(result.events).toContainEqual(expect.objectContaining({ stage: "fetch_structured_data", state: "timed_out" }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns only a limited deterministic result at the deadline when earlier verified evidence is sufficient", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(STARTED_AT));
    try {
      const run = createAnalysisOrchestrator({
        marketEvidenceSource: {
          collectMarketEvidence: async ({ lineId }) => lineId === "line-1"
            ? [marketEvidence(lineId)]
            : new Promise(() => undefined),
        },
        eventEvidenceSource: { collectEventEvidence: async () => [] },
        modelGateway: successfulGateway(),
        createId: () => "analysis-1",
        now: () => new Date(Date.now()),
      }, { hardDeadlineMs: 180, targetDurationMs: 90 }).run({
        snapshot: snapshot(2),
        latestCompleteTradingDay: TRADING_DAY,
        evidenceCutoffAt: CUTOFF_AT,
      });
      await vi.advanceTimersByTimeAsync(180);
      const result = await run;
      expect(result.terminal_reason).toBe("deadline");
      expect(result.analysis.status).toBe("limited");
      expect(result.analysis.coverage.covered_line_ids).toEqual(["line-1"]);
      expect(result.analysis.conclusions.every((item) => item.provenance !== "generated")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports result-sink failure without rewriting an already validated analysis", async () => {
    const run = createAnalysisOrchestrator({
      marketEvidenceSource: { collectMarketEvidence: async ({ lineId }) => [marketEvidence(lineId)] },
      eventEvidenceSource: { collectEventEvidence: async () => [] },
      modelGateway: successfulGateway(),
      resultSink: { save: async () => { throw new Error("storage unavailable"); } },
      createId: () => "analysis-1",
      now: () => new Date(STARTED_AT),
    });
    const result = await run.run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });
    expect(result.terminal_reason).toBe("persistence_failure");
    expect(result.analysis.status).toBe("supported");
    expect(result.narrative).toBeDefined();
    expect(result.events).toContainEqual(expect.objectContaining({ stage: "persist_or_return", state: "failed" }));
  });

  it("closes the persistence commit fence at the hard deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(STARTED_AT));
    try {
      let committed = false;
      const run = createAnalysisOrchestrator({
        marketEvidenceSource: { collectMarketEvidence: async ({ lineId }) => [marketEvidence(lineId)] },
        eventEvidenceSource: { collectEventEvidence: async () => [] },
        modelGateway: successfulGateway(),
        resultSink: {
          save: async (_result, fence) => new Promise<void>((resolve) => {
            setTimeout(() => {
              if (fence.canCommit()) committed = true;
              resolve();
            }, 250);
          }),
        },
        createId: () => "analysis-1",
        now: () => new Date(Date.now()),
      }, { hardDeadlineMs: 180, targetDurationMs: 90 }).run({
        snapshot: snapshot(1),
        latestCompleteTradingDay: TRADING_DAY,
        evidenceCutoffAt: CUTOFF_AT,
      });

      await vi.advanceTimersByTimeAsync(180);
      const result = await run;
      expect(result.terminal_reason).toBe("deadline");
      await vi.advanceTimersByTimeAsync(70);
      expect(committed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates onEvent observer failures and keeps one terminal state per stage", async () => {
    const result = await createAnalysisOrchestrator({
      marketEvidenceSource: { collectMarketEvidence: async ({ lineId }) => [marketEvidence(lineId)] },
      eventEvidenceSource: { collectEventEvidence: async () => [] },
      modelGateway: successfulGateway(),
      onEvent: () => { throw new Error("observer failed"); },
      createId: () => "analysis-1",
      now: () => new Date(STARTED_AT),
    }).run({
      snapshot: snapshot(1),
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: CUTOFF_AT,
    });

    expect(result.terminal_reason).toBe("completed");
    for (const stage of new Set(result.events.map((event) => event.stage))) {
      const terminals = result.events.filter((event) =>
        event.stage === stage && ["succeeded", "failed", "cancelled", "timed_out"].includes(event.state)
      );
      expect(terminals).toHaveLength(1);
    }
  });
});
