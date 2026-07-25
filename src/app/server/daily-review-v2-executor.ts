import {
  buildReviewPacket,
  deriveAnalysisInputs,
  GENERATED_DAILY_REVIEW_SCHEMA_VERSION,
  GENERATED_PERSONA_REPORT_SCHEMA_VERSION,
  GENERATED_RATIONAL_REPORT_SCHEMA_VERSION,
  generatedPersonaReportSchema,
  generatedRationalReportSchema,
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  validateGeneratedDailyReview,
  validateGeneratedPersonaReport,
  validateGeneratedRationalReport,
  type GeneratedReportV2,
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
import {
  selectAtlasKind,
  type AtlasCandidateGenerator,
  type AtlasCardV1,
} from "../../atlas/index.js";
import type { AnalysisResult, EvidenceRecord } from "../../contracts/index.js";
import type { ModelGateway } from "../../model/index.js";
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
  atlasCandidateGenerator: Pick<AtlasCandidateGenerator, "generate">;
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
        reason: "本次复盘使用确定性证据与派生结果，并分别生成理性背面、角色正面和 Atlas 候选。",
        unavailable: false,
      });
      if (analysis.status === "unavailable") return unavailable("结构化证据不足以形成可展示报告。");

      activeStage = "form_conclusions_and_advice";
      input.emit(activeStage, "running", { message: "生成并校验理性客观背面。" });
      const rationalReport = await this.generateRational(
        compiled,
        reviewPacket,
        modelTimeoutMs,
        deadlineAt,
        deadlineController.signal,
      );
      if (!rationalReport) {
        input.emit(activeStage, "failed", { message: "理性报告未通过完整校验。" });
        input.emit("render_theme_and_validate_output", "failed", { message: "未校验文本不展示或保存。" });
        return unavailable("理性报告未通过版本化结构、引用或内容边界校验。");
      }
      input.emit(activeStage, "succeeded");
      activeStage = "render_theme_and_validate_output";
      input.emit(activeStage, "running", { message: "生成角色正面和独立 Atlas 候选并执行一致性校验。" });
      const generated = await this.generatePersonaAndAtlas(
        compiled,
        reviewPacket,
        rationalReport,
        analysis,
        snapshot,
        existingAtlasCards,
        modelTimeoutMs,
        deadlineAt,
        deadlineController.signal,
      );
      if (!generated) {
        input.emit(activeStage, "failed", { message: "角色报告未通过一致性或内容边界校验。" });
        return unavailable("角色报告未通过版本化结构、引用或内容边界校验。");
      }
      input.emit(activeStage, generated.atlas_validation === "invalid_candidate" ? "failed" : "succeeded", {
        ...(generated.atlas_validation === "invalid_candidate"
          ? { message: "报告有效，但图鉴候选无效；本次保存报告并记为无卡。" }
          : {}),
      });

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
        source: { kind: "live", is_live: true, label: "PandaAI/Bocha 证据 + step-explore 三次受约束生成" },
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

  private async generateRational(
    compiled: ReturnType<typeof compileDailyReviewPrompt>,
    packet: ReviewPacketV2,
    modelTimeoutMs: number,
    deadlineAt: number,
    signal: AbortSignal,
  ): Promise<GeneratedReportV2 | null> {
    const rationalResponse = await waitForAbort(this.dependencies.modelGateway.generate<unknown>({
      operation: "daily_review_rational_v2",
      schemaVersion: GENERATED_RATIONAL_REPORT_SCHEMA_VERSION,
      schema: generatedRationalReportSchema(),
      instructions: compiled.rational_instructions,
      input: compiled.input,
      signal,
      timeoutMs: Math.min(modelTimeoutMs, this.remainingMs(deadlineAt)),
      temperature: 0.2,
      maxOutputTokens: 5_000,
    }), signal);
    if (!rationalResponse.ok ||
      (rationalResponse.finishReason !== undefined && rationalResponse.finishReason !== "stop")) return null;
    return validateGeneratedRationalReport(rationalResponse.value, packet);
  }

  private async generatePersonaAndAtlas(
    compiled: ReturnType<typeof compileDailyReviewPrompt>,
    packet: ReviewPacketV2,
    rationalReport: GeneratedReportV2,
    analysis: AnalysisResult,
    snapshot: Parameters<AtlasCandidateGenerator["generate"]>[0]["snapshot"],
    existingAtlasCards: AtlasCardV1[],
    modelTimeoutMs: number,
    deadlineAt: number,
    signal: AbortSignal,
  ): Promise<ValidatedGeneratedDailyReviewV2 | null> {
    const personaResponse = await waitForAbort(this.dependencies.modelGateway.generate<unknown>({
      operation: "daily_review_persona_v2",
      schemaVersion: GENERATED_PERSONA_REPORT_SCHEMA_VERSION,
      schema: generatedPersonaReportSchema(compiled.persona_id),
      instructions: compiled.persona_instructions,
      input: { review_packet: compiled.input, rational_report: rationalReport },
      signal,
      timeoutMs: Math.min(modelTimeoutMs, this.remainingMs(deadlineAt)),
      temperature: 0.8,
      maxOutputTokens: 3_000,
    }), signal);
    if (!personaResponse.ok ||
      (personaResponse.finishReason !== undefined && personaResponse.finishReason !== "stop")) return null;
    const personaReport = validateGeneratedPersonaReport(personaResponse.value, packet, rationalReport);
    if (!personaReport) return null;

    let atlasCandidate: unknown | null = null;
    try {
      atlasCandidate = await waitForAbort(this.dependencies.atlasCandidateGenerator.generate({
        analysis,
        existing_cards: existingAtlasCards,
        snapshot,
        selected_kind: packet.atlas.selected_kind,
      }, signal), signal);
    } catch (error) {
      if (error instanceof HardDeadlineReached) throw error;
    }

    const checked = validateGeneratedDailyReview({
      schema_version: GENERATED_DAILY_REVIEW_SCHEMA_VERSION,
      rational_report: rationalReport,
      persona_report: personaReport,
      atlas_candidate: atlasCandidate,
    }, packet);
    return checked.ok ? checked.value : null;
  }
}
