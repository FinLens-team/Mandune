import {
  buildReviewPacket,
  deriveAnalysisInputs,
  generatedDailyReviewSchema,
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  validateGeneratedDailyReview,
  type ReviewPacketV2,
  type ValidatedGeneratedDailyReviewV2,
} from "../../analysis/index.js";
import {
  compileDailyReviewPrompt,
  personaForTheme,
} from "../../analysis/prompt-compiler.js";
import {
  fallbackAnalysis,
  freezeSnapshot,
  normalizeMarketEvidenceDates,
  omitDuplicateEvidenceIds,
} from "../../analysis/runtime.js";
import { selectAtlasKind, type AtlasCardV1 } from "../../atlas/index.js";
import type { EvidenceRecord } from "../../contracts/index.js";
import type { ModelGateway, ModelGatewayFailureCode } from "../../model/index.js";
import type { BochaEvidenceCollector, CachedPandaEvidenceCollector } from "../../providers/index.js";
import { latestCompleteTradingDay } from "./live-executor.js";
import type { AnalysisExecution, AnalysisExecutor } from "./types.js";

const DEFAULT_HARD_DEADLINE_MS = 180_000;

class HardDeadlineReached extends Error {}

export interface DailyReviewV2ExecutorDependencies {
  modelGateway: ModelGateway;
  marketEvidenceCollector: Pick<CachedPandaEvidenceCollector, "collect">;
  eventEvidenceCollector?: Pick<BochaEvidenceCollector, "collect">;
  listAtlasCards: (workspaceId: string) => Promise<AtlasCardV1[]>;
}

export interface DailyReviewV2ExecutorOptions {
  modelTimeoutMs?: number;
  hardDeadlineMs?: number;
}

function waitForAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new HardDeadlineReached());
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new HardDeadlineReached());
    signal.addEventListener("abort", aborted, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
  });
}

function hasUsableMarketCoverage(
  evidence: readonly EvidenceRecord[],
  coveredLineIds: readonly string[],
): boolean {
  if (coveredLineIds.length === 0) return false;
  return evidence.some((item) =>
    (item.metric_or_event_type === "close" || item.metric_or_event_type === "nav") &&
    (item.status === "available" ||
      (item.status === "ambiguous" && item.normalization_note === "unitless_return_eligible:same_provider_method")));
}

function resolveTradingDay(candidateDay: string, evidence: readonly EvidenceRecord[]): string {
  const observedDays = evidence.flatMap((item) => {
    const eligibleStatus = item.status === "available" ||
      (item.status === "ambiguous" && item.normalization_note === "unitless_return_eligible:same_provider_method");
    const day = item.observation_or_event_time.slice(0, 10);
    return (item.metric_or_event_type === "close" || item.metric_or_event_type === "nav") &&
      eligibleStatus && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= candidateDay
      ? [day]
      : [];
  });
  return observedDays.sort().at(-1) ?? candidateDay;
}

function unavailableSource(): AnalysisExecution["source"] {
  return { kind: "unavailable", is_live: false, label: "实时数据或模型输出当前不可用" };
}

export class DailyReviewV2Executor implements AnalysisExecutor {
  constructor(
    private readonly dependencies: DailyReviewV2ExecutorDependencies,
    private readonly options: DailyReviewV2ExecutorOptions = {},
  ) {}

  async execute(input: Parameters<AnalysisExecutor["execute"]>[0]): Promise<AnalysisExecution> {
    const hardDeadlineMs = this.options.hardDeadlineMs ?? DEFAULT_HARD_DEADLINE_MS;
    const modelTimeoutMs = this.options.modelTimeoutMs ?? 150_000;
    const deadlineController = new AbortController();
    const deadlineAt = Date.now() + hardDeadlineMs;
    const deadlineTimer = setTimeout(() => deadlineController.abort(), hardDeadlineMs);
    const startedAt = input.now();
    const startedAtIso = startedAt.toISOString();
    const evidenceCutoffAt = startedAtIso;
    let tradingDay = latestCompleteTradingDay(startedAt);
    const snapshot = freezeSnapshot(input.snapshot);
    let activeStage: Parameters<typeof input.emit>[0] = "fetch_structured_data";
    let evidence: EvidenceRecord[] = [];
    let derivations: ReturnType<typeof deriveAnalysisInputs> | undefined;
    let reviewPacket: ReviewPacketV2 | undefined;

    const unavailable = (reason: string): AnalysisExecution => ({
      analysis: fallbackAnalysis({
        analysisId: input.analysisId,
        snapshotId: snapshot.snapshot_id,
        constraints: snapshot.constraints,
        themeId: snapshot.theme_id,
        startedAt: startedAtIso,
        completedAt: input.now().toISOString(),
        latestTradingDay: tradingDay,
        cutoffAt: evidenceCutoffAt,
        evidence,
        derivations,
        reason,
        unavailable: true,
      }),
      ...(reviewPacket ? { review_packet: reviewPacket } : {}),
      rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
      source: unavailableSource(),
    });

    input.emit("validate_snapshot", "succeeded");
    input.emit("resolve_assets", "succeeded", { covered_count: snapshot.lines.length });

    try {
      input.emit("fetch_structured_data", "running", { message: "从缓存或 PandaAI 获取市场证据。" });
      const market = await waitForAbort(this.dependencies.marketEvidenceCollector.collect({
        snapshot,
        tradingDay,
        signal: deadlineController.signal,
      }), deadlineController.signal);
      const marketEvidence = omitDuplicateEvidenceIds(market.evidence);
      tradingDay = resolveTradingDay(tradingDay, marketEvidence);
      evidence = normalizeMarketEvidenceDates(marketEvidence, tradingDay);
      input.emit("fetch_structured_data", "succeeded", {
        covered_count: snapshot.lines.length - market.failures.length,
        ...(market.failures.length > 0 ? { message: "部分持仓市场数据不可用，已保留逐项缺口。" } : {}),
      });

      activeStage = "discover_and_verify_events";
      input.emit(activeStage, "running", { message: "发现事件候选并核验允许来源正文。" });
      if (this.dependencies.eventEvidenceCollector) {
        const events = await waitForAbort(this.dependencies.eventEvidenceCollector.collect({
          lines: snapshot.lines.map((line) => ({
            lineId: line.line_id,
            symbol: line.symbol,
            name: line.name,
          })),
          tradingDay,
          signal: deadlineController.signal,
        }), deadlineController.signal);
        evidence = normalizeMarketEvidenceDates(
          omitDuplicateEvidenceIds([...evidence, ...events.evidence]),
          tradingDay,
        );
        input.emit(activeStage, "succeeded", {
          covered_count: events.evidence.filter((item) => item.status === "available").length,
          ...(events.searchFailures.length > 0 ? { message: "部分事件搜索失败，未用候选摘要支持结论。" } : {}),
        });
      } else {
        input.emit(activeStage, "failed", { message: "事件核验未配置，本次保留为证据缺口。" });
      }

      activeStage = "derive_exposure_and_constraints";
      input.emit(activeStage, "running");
      derivations = deriveAnalysisInputs({ snapshot, evidence, latestCompleteTradingDay: tradingDay });
      input.emit(activeStage, "succeeded", { covered_count: derivations.coverage.covered_line_ids.length });
      if (!hasUsableMarketCoverage(evidence, derivations.coverage.covered_line_ids)) {
        input.emit("form_conclusions_and_advice", "failed", {
          message: "全部市场数据不可用，本次未调用模型。",
        });
        input.emit("render_theme_and_validate_output", "failed", {
          message: "没有已校验理性报告可生成人格表达。",
        });
        return unavailable("全部市场数据不可用，未调用模型生成报告。");
      }

      const selectedAtlasKind = selectAtlasKind(input.analysisId);
      const personaId = personaForTheme(snapshot.theme_id);
      let existingAtlasCards: AtlasCardV1[] = [];
      try {
        existingAtlasCards = await waitForAbort(
          this.dependencies.listAtlasCards(input.workspaceId),
          deadlineController.signal,
        );
      } catch (error) {
        if (error instanceof HardDeadlineReached) throw error;
      }
      reviewPacket = buildReviewPacket({
        analysisId: input.analysisId,
        snapshot,
        latestCompleteTradingDay: tradingDay,
        evidenceCutoffAt,
        personaId,
        evidence,
        derivations,
        selectedAtlasKind,
        existingAtlasCards,
      });
      const compiled = compileDailyReviewPrompt(reviewPacket, personaId);

      activeStage = "form_conclusions_and_advice";
      input.emit(activeStage, "running", { message: "通过一次结构化调用生成正反面报告与图鉴候选。" });
      const generated = await this.generate(compiled, reviewPacket, modelTimeoutMs, deadlineAt, deadlineController.signal);
      if (!generated) {
        input.emit(activeStage, "failed", { message: "模型输出在有限重试后仍未通过完整校验。" });
        input.emit("render_theme_and_validate_output", "failed", { message: "未校验文本不展示或保存。" });
        return unavailable("模型输出未通过版本化结构、引用或内容边界校验。");
      }
      input.emit(activeStage, "succeeded");
      activeStage = "render_theme_and_validate_output";
      input.emit(activeStage, "running", { message: "校验人格一致性和 Atlas 子对象。" });
      input.emit(activeStage, generated.atlas_validation === "invalid_candidate" ? "failed" : "succeeded", {
        ...(generated.atlas_validation === "invalid_candidate"
          ? { message: "报告有效，但图鉴候选无效；本次保存报告并记为无卡。" }
          : {}),
      });

      const analysis = fallbackAnalysis({
        analysisId: input.analysisId,
        snapshotId: snapshot.snapshot_id,
        constraints: snapshot.constraints,
        themeId: snapshot.theme_id,
        startedAt: startedAtIso,
        completedAt: input.now().toISOString(),
        latestTradingDay: tradingDay,
        cutoffAt: evidenceCutoffAt,
        evidence,
        derivations,
        reason: "本次复盘使用确定性证据与派生结果，并通过单次结构化模型调用生成正反面报告。",
        unavailable: false,
      });
      if (analysis.status === "unavailable") return unavailable("结构化证据不足以形成可展示报告。");
      input.onText?.(generated.rational_report.markdown);
      return {
        analysis,
        ai_text: generated.rational_report.markdown,
        ai_theme_text: generated.persona_report.markdown,
        review_packet: reviewPacket,
        generated_review: generated,
        model_id: compiled.model_id,
        prompt_version: compiled.prompt_version,
        skill_versions: compiled.skill_versions,
        atlas_policy_version: compiled.atlas_policy_version,
        rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
        source: { kind: "live", is_live: true, label: "PandaAI/Bocha 证据 + step-explore 单次生成" },
      };
    } catch (error) {
      if (!(error instanceof HardDeadlineReached)) throw error;
      input.emit(activeStage, "timed_out", { message: "复盘达到整体硬截止，迟到结果已隔离。" });
      return unavailable("复盘达到整体硬截止，所有未完成供应商和模型任务已取消。");
    } finally {
      clearTimeout(deadlineTimer);
      if (!deadlineController.signal.aborted) deadlineController.abort();
    }
  }

  private remainingMs(deadlineAt: number): number {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw new HardDeadlineReached();
    return remaining;
  }

  private async generate(
    compiled: ReturnType<typeof compileDailyReviewPrompt>,
    packet: ReviewPacketV2,
    modelTimeoutMs: number,
    deadlineAt: number,
    signal: AbortSignal,
  ): Promise<ValidatedGeneratedDailyReviewV2 | null> {
    let priorErrors: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const timeoutMs = Math.min(modelTimeoutMs, this.remainingMs(deadlineAt));
      const response = await waitForAbort(this.dependencies.modelGateway.generate<unknown>({
        operation: "daily_review_v2",
        schemaVersion: "generated-daily-review.v2",
        schema: generatedDailyReviewSchema(compiled.persona_id),
        instructions: attempt === 0
          ? compiled.instructions
          : `${compiled.instructions}\n\n【唯一一次修复】\n上次输出未通过：${priorErrors.join(", ")}。只修复 JSON、引用或内容边界；不得新增事实。`,
        input: compiled.input,
        signal,
        timeoutMs,
      }), signal);
      if (!response.ok) {
        if (!this.shouldRetry(response.code, response.retryable, attempt)) return null;
        priorErrors = [response.code];
        continue;
      }
      if (response.finishReason !== undefined && response.finishReason !== "stop") {
        priorErrors = [`finish_reason:${response.finishReason}`];
        if (attempt === 1) return null;
        continue;
      }
      const checked = validateGeneratedDailyReview(response.value, packet);
      if (checked.ok) return checked.value;
      priorErrors = checked.errors;
      if (attempt === 1) return null;
    }
    return null;
  }

  private shouldRetry(code: ModelGatewayFailureCode, retryable: boolean, attempt: number): boolean {
    return attempt === 0 && retryable && code !== "privacy_violation" && code !== "cancelled";
  }
}
