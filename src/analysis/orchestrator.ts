import {
  CONTRACTS_VERSION,
  validatePortfolioSnapshot,
  validateTaskEvent,
  type AnalysisResult,
  type EvidenceRecord,
  type PortfolioSnapshot,
  type TaskEvent,
  type TaskEventStage,
  type TaskEventState,
} from "../contracts/index.js";
import type { ModelGateway } from "../model/index.js";
import { hasPrivatePayload } from "../model/index.js";
import { deriveAnalysisInputs, type AnalysisDerivations } from "./derivations.js";
import {
  deepFreeze,
  fallbackAnalysis,
  freezeSnapshot,
  isoDateTime,
  normalizeMarketEvidenceDates,
  omitDuplicateEvidenceIds,
  raceWithAbort,
  RunInterrupted,
  safeEvidenceBatch,
  safeFailureEvidence,
  semanticIsoDate,
  UNKNOWN_CONSTRAINTS,
  uniqueEvidence,
} from "./runtime.js";
import {
  RATIONAL_ANALYSIS_SCHEMA,
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  THEME_NARRATIVE_SCHEMA,
  THEME_NARRATIVE_SCHEMA_VERSION,
  validateOwnedAnalysisResult,
  validateRationalModelOutput,
  validateThemeModelOutput,
  type RationalModelOutput,
  type ThemeModelOutput,
} from "./validation.js";

const STAGES: TaskEventStage[] = [
  "validate_snapshot",
  "resolve_assets",
  "fetch_structured_data",
  "discover_and_verify_events",
  "derive_exposure_and_constraints",
  "form_conclusions_and_advice",
  "render_theme_and_validate_output",
  "persist_or_return",
];

export interface MarketEvidenceSource {
  collectMarketEvidence(input: {
    lineId: string;
    assetClass: PortfolioSnapshot["lines"][number]["asset_class"];
    symbol: string;
    acquiredAt: string;
    latestCompleteTradingDay: string;
    signal: AbortSignal;
  }): Promise<EvidenceRecord[]>;
}

export interface EventEvidenceSource {
  collectEventEvidence(input: {
    lineId: string;
    symbol: string;
    acquiredAt: string;
    evidenceCutoffAt: string;
    signal: AbortSignal;
  }): Promise<EvidenceRecord[]>;
}

export interface AnalysisResultSink {
  save(result: {
    analysis: AnalysisResult;
    rational_analysis_version: typeof RATIONAL_ANALYSIS_SCHEMA_VERSION;
    narrative?: ThemeModelOutput;
    /** Relaxed Demo mode: free-form model narrative streamed to the client. */
    ai_text?: string;
  }, fence: AnalysisCommitFence): Promise<void>;
}

export interface AnalysisCommitFence {
  readonly signal: AbortSignal;
  /** Must be checked immediately before the sink's atomic commit. */
  canCommit(): boolean;
}

export interface AnalysisOrchestratorDependencies {
  marketEvidenceSource: MarketEvidenceSource;
  eventEvidenceSource: EventEvidenceSource;
  modelGateway: ModelGateway;
  resultSink?: AnalysisResultSink;
  onEvent?: (event: TaskEvent) => void;
  createId?: () => string;
  now?: () => Date;
}

export interface AnalysisOrchestratorOptions {
  targetDurationMs?: number;
  hardDeadlineMs?: number;
  maxModelAttempts?: number;
  modelAttemptTimeoutMs?: number;
}

export interface AnalysisRunRequest {
  snapshot: unknown;
  latestCompleteTradingDay: string;
  evidenceCutoffAt: string;
  signal?: AbortSignal;
}

export interface AnalysisRunResult {
  analysis: AnalysisResult;
  rational_analysis_version: typeof RATIONAL_ANALYSIS_SCHEMA_VERSION;
  narrative?: ThemeModelOutput;
  events: TaskEvent[];
  timing: {
    target_ms: number;
    hard_deadline_ms: number;
    elapsed_ms: number;
    met_target: boolean;
  };
  terminal_reason: "completed" | "cancelled" | "deadline" | "invalid_input" | "model_failure" | "persistence_failure";
}

export function createAnalysisOrchestrator(
  dependencies: AnalysisOrchestratorDependencies,
  options: AnalysisOrchestratorOptions = {},
): { run(request: AnalysisRunRequest): Promise<AnalysisRunResult> } {
  const targetDurationMs = options.targetDurationMs ?? 90_000;
  const hardDeadlineMs = options.hardDeadlineMs ?? 180_000;
  const maxModelAttempts = options.maxModelAttempts ?? 2;
  const modelAttemptTimeoutMs = options.modelAttemptTimeoutMs ?? 60_000;
  if (targetDurationMs <= 0 || hardDeadlineMs <= targetDurationMs || maxModelAttempts < 1 || modelAttemptTimeoutMs <= 0) {
    throw new Error("Invalid analysis orchestrator timing or retry configuration.");
  }

  return {
    async run(request): Promise<AnalysisRunResult> {
      const now = dependencies.now ?? (() => new Date());
      const analysisId = (dependencies.createId ?? (() => crypto.randomUUID()))();
      const started = now();
      const startedAt = started.toISOString();
      const events: TaskEvent[] = [];
      let eventCounter = 0;
      let failedStage: TaskEventStage | undefined;
      let manualStage: TaskEventStage | undefined;
      let interruptReason: "cancelled" | "deadline" | undefined;
      const controller = new AbortController();
      const externalAbort = () => {
        if (!controller.signal.aborted) {
          interruptReason = "cancelled";
          controller.abort();
        }
      };
      request.signal?.addEventListener("abort", externalAbort, { once: true });
      if (request.signal?.aborted) externalAbort();
      const deadlineTimer = setTimeout(() => {
        if (!controller.signal.aborted) {
          interruptReason = "deadline";
          controller.abort();
        }
      }, hardDeadlineMs);

      const emit = (stage: TaskEventStage, state: TaskEventState, extra: Partial<TaskEvent> = {}) => {
        const event: TaskEvent = {
          event_id: `${analysisId}:event:${++eventCounter}`,
          analysis_id: analysisId,
          stage,
          state,
          occurred_at: now().toISOString(),
          ...extra,
        };
        const validated = validateTaskEvent(event);
        if (!validated.ok) throw new Error("Internal task event failed validation.");
        Object.freeze(event);
        events.push(event);
        try {
          dependencies.onEvent?.(event);
        } catch {
          // Observers cannot change the internal task state machine.
        }
      };

      const stage = async <T>(
        name: TaskEventStage,
        message: string,
        work: () => T | Promise<T>,
        succeededEvent?: (value: T) => Partial<TaskEvent>,
      ): Promise<T> => {
        emit(name, "pending");
        emit(name, "running", { message });
        try {
          const value = await raceWithAbort(Promise.resolve().then(work), controller.signal, () => interruptReason);
          emit(name, "succeeded", succeededEvent?.(value));
          return value;
        } catch (error) {
          if (error instanceof RunInterrupted) {
            emit(name, error.reason === "deadline" ? "timed_out" : "cancelled");
          } else {
            failedStage = name;
            emit(name, "failed");
          }
          throw error;
        }
      };

      const finish = (analysis: AnalysisResult, terminalReason: AnalysisRunResult["terminal_reason"], narrative?: ThemeModelOutput): AnalysisRunResult => {
        const elapsed = Math.max(0, now().getTime() - started.getTime());
        deepFreeze(analysis);
        if (narrative) deepFreeze(narrative);
        deepFreeze(events);
        return {
          analysis,
          rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
          ...(narrative ? { narrative } : {}),
          events,
          timing: {
            target_ms: targetDurationMs,
            hard_deadline_ms: hardDeadlineMs,
            elapsed_ms: elapsed,
            met_target: elapsed <= targetDurationMs,
          },
          terminal_reason: terminalReason,
        };
      };

      let frozen: PortfolioSnapshot | undefined;
      let evidence: EvidenceRecord[] = [];
      let derivations: AnalysisDerivations | undefined;
      let rational: RationalModelOutput | undefined;
      let analysis: AnalysisResult | undefined;
      let narrative: ThemeModelOutput | undefined;
      let terminalReason: AnalysisRunResult["terminal_reason"] = "completed";

      const modelAttempts = async <T>(
        stageName: TaskEventStage,
        operation: string,
        requestFactory: () => Parameters<ModelGateway["generate"]>[0],
        validate: (value: unknown) => value is T,
      ): Promise<T | undefined> => {
        for (let attempt = 1; attempt <= maxModelAttempts; attempt += 1) {
          const response = await raceWithAbort(
            dependencies.modelGateway.generate<T>(requestFactory()),
            controller.signal,
            () => interruptReason,
          );
          if (response.ok && validate(response.value)) return response.value;
          const retryable = !response.ok ? response.retryable : true;
          if (!retryable || attempt === maxModelAttempts) return undefined;
          emit(stageName, "retrying", {
            message: `${operation} 输出未通过边界校验，执行有限重试。`,
            retry_count: attempt,
          });
        }
        return undefined;
      };

      try {
        frozen = await stage("validate_snapshot", "校验并冻结确认快照。", () => {
          if (!semanticIsoDate(request.latestCompleteTradingDay) || !isoDateTime(request.evidenceCutoffAt)) {
            throw new Error("Invalid frozen analysis time boundary.");
          }
          const validated = validatePortfolioSnapshot(request.snapshot);
          if (!validated.ok) throw new Error("Invalid portfolio snapshot.");
          if (hasPrivatePayload(validated.value)) throw new Error("Private payload is forbidden in analysis input.");
          const snapshotCreatedAt = Date.parse(validated.value.created_at);
          const tradingDayAt = Date.parse(`${request.latestCompleteTradingDay}T00:00:00.000Z`);
          const cutoffAt = Date.parse(request.evidenceCutoffAt);
          const startedAtMs = started.getTime();
          if (
            snapshotCreatedAt > startedAtMs ||
            tradingDayAt > cutoffAt ||
            cutoffAt > startedAtMs
          ) {
            throw new Error("Frozen analysis time boundaries are out of order.");
          }
          return freezeSnapshot(validated.value);
        });

        await stage("resolve_assets", "解析已确认资产与覆盖范围。", () => {
          if (frozen!.lines.some((line) => !line.symbol.trim())) throw new Error("Unresolved confirmed asset.");
        });

        await stage("fetch_structured_data", "获取结构化市场证据。", async () => {
          for (const line of frozen!.lines) {
            let batch: unknown;
            try {
              batch = await raceWithAbort(dependencies.marketEvidenceSource.collectMarketEvidence({
                lineId: line.line_id,
                assetClass: line.asset_class,
                symbol: line.symbol,
                acquiredAt: now().toISOString(),
                latestCompleteTradingDay: request.latestCompleteTradingDay,
                signal: controller.signal,
              }), controller.signal, () => interruptReason);
            } catch (error) {
              if (error instanceof RunInterrupted) throw error;
              batch = undefined;
            }
            evidence.push(...(safeEvidenceBatch(batch, request.evidenceCutoffAt, {
              lineId: line.line_id,
              symbol: line.symbol,
            }) ? normalizeMarketEvidenceDates(batch, request.latestCompleteTradingDay) : [safeFailureEvidence({
              id: `market-failed-${line.line_id}`,
              lineId: line.line_id,
              symbol: line.symbol,
              type: "close",
              source: "market-evidence-source",
              time: request.latestCompleteTradingDay,
              fetchedAt: now().toISOString(),
              limitation: "结构化数据调用失败或返回未通过隐私与时间校验。",
            })]));
          }
          evidence = uniqueEvidence(evidence);
        });

        await stage("discover_and_verify_events", "发现并核验相关事件来源。", async () => {
          for (const line of frozen!.lines) {
            let batch: unknown;
            try {
              batch = await raceWithAbort(dependencies.eventEvidenceSource.collectEventEvidence({
                lineId: line.line_id,
                symbol: line.symbol,
                acquiredAt: now().toISOString(),
                evidenceCutoffAt: request.evidenceCutoffAt,
                signal: controller.signal,
              }), controller.signal, () => interruptReason);
            } catch (error) {
              if (error instanceof RunInterrupted) throw error;
              batch = undefined;
            }
            if (safeEvidenceBatch(batch, request.evidenceCutoffAt, {
              lineId: line.line_id,
              symbol: line.symbol,
            })) {
              evidence.push(...batch);
            } else {
              evidence.push(safeFailureEvidence({
                id: `event-failed-${line.line_id}`,
                lineId: line.line_id,
                symbol: line.symbol,
                type: "candidate_event",
                source: "event-evidence-source",
                time: request.evidenceCutoffAt,
                fetchedAt: now().toISOString(),
                limitation: "事件发现或核验调用失败，或返回未通过隐私、范围与时间校验。",
              }));
            }
          }
          evidence = uniqueEvidence(evidence);
        });

        derivations = await stage("derive_exposure_and_constraints", "计算可复算覆盖与约束边界。", () =>
          deriveAnalysisInputs({
            snapshot: frozen!,
            evidence,
            latestCompleteTradingDay: request.latestCompleteTradingDay,
          }), (value) => ({ covered_count: value.coverage.covered_line_ids.length }));

        if (derivations.status === "unavailable") {
          const coverage = { covered_count: derivations.coverage.covered_line_ids.length };
          emit("form_conclusions_and_advice", "pending", coverage);
          emit("form_conclusions_and_advice", "failed", { ...coverage, message: "现有证据不足以形成物质性结论。" });
          emit("render_theme_and_validate_output", "pending", coverage);
          emit("render_theme_and_validate_output", "failed", { ...coverage, message: "不可用结果不生成主题叙事。" });
          terminalReason = "model_failure";
          analysis = fallbackAnalysis({
            analysisId,
            snapshotId: frozen.snapshot_id,
            constraints: frozen.constraints,
            themeId: frozen.theme_id,
            startedAt,
            completedAt: now().toISOString(),
            latestTradingDay: request.latestCompleteTradingDay,
            cutoffAt: request.evidenceCutoffAt,
            evidence,
            derivations,
            reason: "现有证据不足以调用模型形成结论。",
            unavailable: true,
          });
        } else {
          const coverage = { covered_count: derivations.coverage.covered_line_ids.length };
          emit("form_conclusions_and_advice", "pending", coverage);
          emit("form_conclusions_and_advice", "running", { ...coverage, message: "在证据边界内形成理性结论。" });
          manualStage = "form_conclusions_and_advice";
          rational = await modelAttempts<RationalModelOutput>(
            "form_conclusions_and_advice",
            "理性分析",
            () => ({
              operation: "rational_analysis",
              schemaVersion: RATIONAL_ANALYSIS_SCHEMA_VERSION,
              schema: RATIONAL_ANALYSIS_SCHEMA,
              instructions: "Generate an evidence-bounded rational analysis. Every material statement and qualitative advice item must cite an allowed reference. Never add facts, precise trade amounts, ratios, prices, timing, guarantees, causal certainty, or professional-adviser claims.",
              input: {
                snapshot: frozen,
                constraints: frozen!.constraints,
                evidence,
                derived: derivations!.derived,
                coverage: derivations!.coverage,
                allowed_status: derivations!.status,
                content_boundary: "qualitative_direction_only",
              },
              signal: controller.signal,
              timeoutMs: Math.min(modelAttemptTimeoutMs, hardDeadlineMs),
            }),
            (value): value is RationalModelOutput => validateRationalModelOutput(value, {
              lineIds: frozen!.lines.map((line) => line.line_id),
              evidence,
              derived: derivations!.derived,
              coverage: derivations!.coverage,
              status: derivations!.status,
              unknowns: derivations!.unknowns,
            }),
          );
          if (!rational) {
            emit("form_conclusions_and_advice", "failed");
            manualStage = undefined;
            terminalReason = "model_failure";
          } else {
            const candidate: AnalysisResult = {
              contracts_version: CONTRACTS_VERSION,
              analysis_id: analysisId,
              snapshot_id: frozen.snapshot_id,
              status: derivations.status,
              analysis_started_at: startedAt,
              analysis_completed_at: now().toISOString(),
              latest_complete_trading_day: request.latestCompleteTradingDay,
              evidence_cutoff_at: request.evidenceCutoffAt,
              theme_id: frozen.theme_id,
              coverage: derivations.coverage,
              constraints: frozen.constraints,
              conclusions: rational.conclusions,
              advice: rational.advice,
              evidence,
              derived: derivations.derived,
              unknowns: derivations.unknowns,
              assumptions: rational.assumptions,
              limitations: [...derivations.limitations, ...rational.limitations],
              risk_notes: rational.risk_notes,
            };
            if (!validateOwnedAnalysisResult(candidate).ok) {
              rational = undefined;
              terminalReason = "model_failure";
              emit("form_conclusions_and_advice", "failed");
            } else {
              analysis = candidate;
              emit("form_conclusions_and_advice", "succeeded");
            }
            manualStage = undefined;
          }

          if (rational && analysis) {
            emit("render_theme_and_validate_output", "pending", coverage);
            emit("render_theme_and_validate_output", "running", { ...coverage, message: "仅基于已校验理性分析生成主题表达。" });
            manualStage = "render_theme_and_validate_output";
            narrative = await modelAttempts<ThemeModelOutput>(
              "render_theme_and_validate_output",
              "主题叙事",
              () => ({
                operation: "theme_narrative",
                schemaVersion: THEME_NARRATIVE_SCHEMA_VERSION,
                schema: THEME_NARRATIVE_SCHEMA,
                instructions: "Rewrite only the validated rational analysis into the requested theme. Preserve every conclusion and advice id, and copy the rational advice statements joined by a Chinese semicolon into guidance_summary exactly. Do not add evidence, facts, predictions, guarantees, exact trade instructions, or mystical market claims.",
                input: {
                  rational_analysis_id: analysisId,
                  theme_id: frozen!.theme_id,
                  rational_analysis: rational,
                },
                signal: controller.signal,
                timeoutMs: Math.min(modelAttemptTimeoutMs, hardDeadlineMs),
              }),
              (value): value is ThemeModelOutput => validateThemeModelOutput(value, rational!, {
                analysisId,
                themeId: frozen!.theme_id,
              }),
            );
            if (!narrative) {
              emit("render_theme_and_validate_output", "failed");
              manualStage = undefined;
              analysis = undefined;
              rational = undefined;
              terminalReason = "model_failure";
            } else {
              emit("render_theme_and_validate_output", "succeeded");
              manualStage = undefined;
            }
          } else {
            emit("render_theme_and_validate_output", "pending", coverage);
            emit("render_theme_and_validate_output", "failed", { ...coverage, message: "理性分析无效，不生成主题叙事。" });
          }

          if (!analysis) {
            analysis = fallbackAnalysis({
              analysisId,
              snapshotId: frozen.snapshot_id,
              constraints: frozen.constraints,
              themeId: frozen.theme_id,
              startedAt,
              completedAt: now().toISOString(),
              latestTradingDay: request.latestCompleteTradingDay,
              cutoffAt: request.evidenceCutoffAt,
              evidence,
              derivations,
              reason: "模型输出未通过结构、引用、隐私或内容边界校验。",
              unavailable: false,
            });
          }
        }

        await stage("persist_or_return", "保存不可变已校验结果或直接返回。", async () => {
          const checked = validateOwnedAnalysisResult(analysis!);
          if (!checked.ok) throw new Error("Final analysis failed strict validation.");
          deepFreeze(analysis!);
          if (narrative) deepFreeze(narrative);
          let commitOpen = true;
          const fence: AnalysisCommitFence = {
            signal: controller.signal,
            canCommit: () => commitOpen && !controller.signal.aborted,
          };
          try {
            await dependencies.resultSink?.save({
              analysis: analysis!,
              rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
              ...(narrative ? { narrative } : {}),
            }, fence);
          } finally {
            commitOpen = false;
          }
        }, () => ({ covered_count: analysis!.coverage.covered_line_ids.length }));
      } catch (error) {
        if (error instanceof RunInterrupted) {
          if (manualStage) {
            emit(manualStage, error.reason === "deadline" ? "timed_out" : "cancelled");
            manualStage = undefined;
          }
          terminalReason = error.reason;
          narrative = undefined;
          const interruptedDerivations = derivations ?? (frozen
            ? deriveAnalysisInputs({
                snapshot: frozen,
                evidence,
                latestCompleteTradingDay: semanticIsoDate(request.latestCompleteTradingDay)
                  ? request.latestCompleteTradingDay
                  : startedAt.slice(0, 10),
              })
            : undefined);
          analysis = fallbackAnalysis({
            analysisId,
            snapshotId: frozen?.snapshot_id ?? "interrupted-snapshot",
            constraints: frozen?.constraints ?? UNKNOWN_CONSTRAINTS,
            themeId: frozen?.theme_id ?? "unknown",
            startedAt,
            completedAt: now().toISOString(),
            latestTradingDay: semanticIsoDate(request.latestCompleteTradingDay) ? request.latestCompleteTradingDay : startedAt.slice(0, 10),
            cutoffAt: isoDateTime(request.evidenceCutoffAt) ? request.evidenceCutoffAt : startedAt,
            evidence,
            derivations: interruptedDerivations,
            reason: error.reason === "deadline" ? "分析达到硬截止，未完成任务已终止。" : "用户取消了本次分析。",
            unavailable: error.reason === "cancelled" || !interruptedDerivations?.coverage.covered_line_ids.length,
          });
        } else {
          evidence = omitDuplicateEvidenceIds(evidence);
          if (manualStage) {
            emit(manualStage, "failed");
            manualStage = undefined;
          }
          const invalidInput = !frozen;
          if (failedStage === "persist_or_return" && analysis) {
            terminalReason = "persistence_failure";
          } else {
            terminalReason = invalidInput ? "invalid_input" : "model_failure";
            narrative = undefined;
            analysis = fallbackAnalysis({
              analysisId,
              snapshotId: frozen?.snapshot_id ?? "invalid-snapshot",
              constraints: frozen?.constraints ?? UNKNOWN_CONSTRAINTS,
              themeId: frozen?.theme_id ?? "unknown",
              startedAt,
              completedAt: now().toISOString(),
              latestTradingDay: semanticIsoDate(request.latestCompleteTradingDay) ? request.latestCompleteTradingDay : startedAt.slice(0, 10),
              cutoffAt: isoDateTime(request.evidenceCutoffAt) ? request.evidenceCutoffAt : startedAt,
              evidence,
              derivations,
              reason: invalidInput ? "分析输入未通过冻结校验。" : "分析任务未能形成可保存的已校验结果。",
              unavailable: true,
            });
          }
        }
      } finally {
        clearTimeout(deadlineTimer);
        request.signal?.removeEventListener("abort", externalAbort);
      }

      return finish(analysis!, terminalReason, narrative);
    },
  };
}

export { STAGES as ANALYSIS_STAGES };
