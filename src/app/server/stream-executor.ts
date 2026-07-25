import {
  deriveAnalysisInputs,
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  type MarketEvidenceSource,
} from "../../analysis/index.js";
import { compileStreamingReviewInstructions } from "../../analysis/prompt-compiler.js";
import {
  fallbackAnalysis,
  freezeSnapshot,
  normalizeMarketEvidenceDates,
  omitDuplicateEvidenceIds,
} from "../../analysis/runtime.js";
import type { EvidenceRecord, PortfolioSnapshot } from "../../contracts/index.js";
import type { ModelGateway } from "../../model/index.js";
import { latestCompleteTradingDay } from "./live-executor.js";
import type { AnalysisExecution, AnalysisExecutor } from "./types.js";
import { themeForId } from "../../theme/index.js";

export interface StreamingAnalysisExecutorDependencies {
  modelGateway: ModelGateway;
  marketEvidenceSource: MarketEvidenceSource;
}

export interface StreamingAnalysisExecutorOptions {
  /** Whole-batch upstream quote timeout. */
  marketTimeoutMs?: number;
  /** Streaming model attempt timeout, well inside the 180s hard deadline. */
  modelTimeoutMs?: number;
  /** One hard deadline shared by evidence collection and both model calls. */
  hardDeadlineMs?: number;
}

const DEFAULT_HARD_DEADLINE_MS = 180_000;

const RATIONAL_START = "<!-- MANDONG_RATIONAL_REPORT_START -->";
const RATIONAL_END = "<!-- MANDONG_RATIONAL_REPORT_END -->";
const PERSONA_START = "<!-- MANDONG_PERSONA_REPORT_START -->";
const PERSONA_END = "<!-- MANDONG_PERSONA_REPORT_END -->";

class HardDeadlineReached extends Error {}

function progressHeading(raw: string): string | undefined {
  const title = raw
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/[*_`~#]/gu, "")
    .replace(/^\s*(?:\d+[.)、]\s*)?/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  return title ? title.slice(0, 48) : undefined;
}

function createHeadingProgressReporter(
  report: (message: string) => void,
  privateTerms: readonly string[],
): { finish: () => void; push: (delta: string) => void; scan: (text: string) => void } {
  let pending = "";
  const seen = new Set<string>();

  function consume(line: string): void {
    const match = /^\s{0,3}#{1,6}[\t ]*(.+?)\s*#*\s*$/u.exec(line);
    const candidate = match?.[1] ? progressHeading(match[1]) : undefined;
    const title = candidate && privateTerms.some((term) => term && candidate.includes(term))
      ? "持仓分析"
      : candidate;
    if (!title) return;
    const key = title.toLocaleLowerCase("zh-CN");
    if (seen.has(key)) return;
    seen.add(key);
    report(`正在生成 ${title}`);
  }

  return {
    push(delta) {
      pending += delta;
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? "";
      for (const line of lines) consume(line);
    },
    finish() {
      if (pending) consume(pending);
      pending = "";
    },
    scan(text) {
      for (const line of text.split(/\r?\n/u)) consume(line);
    },
  };
}

function splitModelReports(text: string): { rational: string; persona: string } | undefined {
  const rationalStart = text.indexOf(RATIONAL_START);
  const rationalEnd = text.indexOf(RATIONAL_END);
  const personaStart = text.indexOf(PERSONA_START);
  const personaEnd = text.indexOf(PERSONA_END);
  if (
    rationalStart === -1 ||
    rationalEnd === -1 ||
    personaStart === -1 ||
    personaEnd === -1 ||
    rationalStart >= rationalEnd ||
    rationalEnd >= personaStart ||
    personaStart >= personaEnd ||
    text.indexOf(RATIONAL_START, rationalStart + RATIONAL_START.length) !== -1 ||
    text.indexOf(RATIONAL_END, rationalEnd + RATIONAL_END.length) !== -1 ||
    text.indexOf(PERSONA_START, personaStart + PERSONA_START.length) !== -1 ||
    text.indexOf(PERSONA_END, personaEnd + PERSONA_END.length) !== -1
  ) {
    return undefined;
  }
  const before = text.slice(0, rationalStart).trim();
  const between = text.slice(rationalEnd + RATIONAL_END.length, personaStart).trim();
  const after = text.slice(personaEnd + PERSONA_END.length).trim();
  const rational = text.slice(rationalStart + RATIONAL_START.length, rationalEnd).trim();
  const persona = text.slice(personaStart + PERSONA_START.length, personaEnd).trim();
  return before || between || after || !rational || !persona ? undefined : { rational, persona };
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

function constraintLabel(value: string): string {
  if (value === "unknown") return "未填写";
  if (value === "not_decided") return "尚未决定";
  return value;
}

function buildPrompt(snapshot: PortfolioSnapshot, evidence: readonly EvidenceRecord[]): string {
  const holdings = snapshot.lines
    .map((line, index) => {
      const market = line.market ? `，市场 ${line.market}` : "";
      return `${index + 1}. ${line.name}（${line.asset_class}，代码 ${line.symbol}${market}）` +
        `：持仓规模「${line.size_basis}」，观察日期 ${line.observation_date}`;
    })
    .join("\n");

  const constraints = [
    `投资期限：${constraintLabel(snapshot.constraints.investment_horizon)}`,
    `近期流动性需求：${constraintLabel(snapshot.constraints.near_term_liquidity)}`,
    `可承受回撤：${constraintLabel(snapshot.constraints.tolerable_drawdown)}`,
    `投资目标：${constraintLabel(snapshot.constraints.investment_objective)}`,
  ].join("\n");

  const evidenceLines = evidence.length === 0
    ? "（本次没有获取到可用行情证据。）"
    : evidence
        .map((item) => {
          const value = item.value === null || item.value === undefined
            ? "无可用值"
            : `${item.value}${item.unit ? ` ${item.unit}` : ""}`;
          const note = item.limitations.length > 0 ? `，说明：${item.limitations.join("；")}` : "";
          return `- ${item.scope.kind === "asset" ? item.scope.symbol ?? item.scope.line_id : "组合"} ` +
            `${item.metric_or_event_type}：${value}（状态 ${item.status}，观察时间 ${item.observation_or_event_time}，来源 ${item.source.name}）${note}`;
        })
        .join("\n");

  return [
    "【当前持仓】",
    holdings || "（无持仓）",
    "",
    "【四项个人约束】",
    constraints,
    "",
    "【已获取的行情证据】",
    evidenceLines,
    "",
    "请基于以上信息生成同一事实基础上的理性报告和当前角色报告，严格遵守系统指令中的四个边界标记与输出顺序。",
  ].join("\n");
}

/**
 * Relaxed Demo executor: it keeps the deterministic evidence, coverage and
 * result-shell pipeline (which still passes the owned-result validators) but
 * replaces the strict, schema-bound model calls with one free-text model call.
 * That call returns separately bounded rational and persona Markdown sections,
 * so the selected skill changes the front without adding a second round trip.
 */
export class StreamingAnalysisExecutor implements AnalysisExecutor {
  constructor(
    private readonly dependencies: StreamingAnalysisExecutorDependencies,
    private readonly options: StreamingAnalysisExecutorOptions = {},
  ) {}

  async execute(input: Parameters<AnalysisExecutor["execute"]>[0]): Promise<AnalysisExecution> {
    const marketTimeoutMs = this.options.marketTimeoutMs ?? 20_000;
    const modelTimeoutMs = this.options.modelTimeoutMs ?? 150_000;
    const hardDeadlineMs = this.options.hardDeadlineMs ?? DEFAULT_HARD_DEADLINE_MS;
    const deadlineController = new AbortController();
    const deadlineAt = Date.now() + hardDeadlineMs;
    const deadlineTimer = setTimeout(() => deadlineController.abort(), hardDeadlineMs);

    const startedAt = input.now();
    const startedAtIso = startedAt.toISOString();
    const evidenceCutoffAt = startedAtIso;
    const tradingDay = latestCompleteTradingDay(startedAt);
    const snapshot = freezeSnapshot(input.snapshot);

    input.emit("validate_snapshot", "succeeded");
    input.emit("resolve_assets", "succeeded", { covered_count: snapshot.lines.length });
    let activeStage: Parameters<typeof input.emit>[0] = "fetch_structured_data";
    let evidence: EvidenceRecord[] = [];
    let derivations: ReturnType<typeof deriveAnalysisInputs> | undefined;

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
      source: { kind: "unavailable", is_live: false, label: "实时数据或模型输出当前不可用" },
    });

    try {
      input.emit("fetch_structured_data", "running", { message: "获取实时行情证据。" });
      evidence = await this.collectEvidence(
        snapshot,
        tradingDay,
        marketTimeoutMs,
        input.now,
        deadlineController.signal,
      );
      const availableCount = evidence.filter((item) => item.status === "available").length;
      input.emit("fetch_structured_data", "succeeded", { covered_count: availableCount });

      input.emit("discover_and_verify_events", "failed", {
        message: "当前实时执行器未配置事件发现与一手来源核验，本阶段保留为证据缺口。",
      });

      activeStage = "derive_exposure_and_constraints";
      input.emit(activeStage, "running");
      derivations = deriveAnalysisInputs({ snapshot, evidence, latestCompleteTradingDay: tradingDay });
      input.emit(activeStage, "succeeded", { covered_count: derivations.coverage.covered_line_ids.length });

      activeStage = "form_conclusions_and_advice";
      input.emit(activeStage, "running", { message: "连通API尝试中" });
      const headings = createHeadingProgressReporter((message) => {
        input.emit(activeStage, "running", { message });
        input.onText?.(`# ${message.slice("正在生成 ".length)}\n`);
      }, snapshot.lines.flatMap((line) => [line.name.trim(), line.symbol.trim()]));
      let receivedFirstDelta = false;
      const reportModelDelta = (delta: string): void => {
        if (!delta) return;
        if (!receivedFirstDelta) {
          receivedFirstDelta = true;
          input.emit(activeStage, "running", { message: "API连通成功" });
          input.emit(activeStage, "running", { message: "正在思考..." });
        }
        headings.push(delta);
      };
      const modelText = await this.streamModelText(
        snapshot,
        evidence,
        Math.min(modelTimeoutMs, this.remainingMs(deadlineAt)),
        deadlineController.signal,
        reportModelDelta,
      );
      if (!receivedFirstDelta && modelText.trim()) reportModelDelta(modelText);
      headings.scan(modelText);
      headings.finish();
      if (!modelText.trim()) {
        input.emit(activeStage, "failed", { message: "模型没有返回可展示的分析正文。" });
        input.emit("render_theme_and_validate_output", "failed", { message: "缺少分析正文，未生成主题表达。" });
        return unavailable("模型没有返回可展示的分析正文。");
      }
      const reports = splitModelReports(modelText) ?? {
        rational: modelText.trim(),
        persona: modelText.trim(),
      };
      if (deadlineController.signal.aborted) throw new HardDeadlineReached();
      input.emit(activeStage, "succeeded");

      activeStage = "render_theme_and_validate_output";
      input.emit(activeStage, "running", {
        message: `校验“${themeForId(snapshot.theme_id).label}”主题表达。`,
      });
      input.emit(activeStage, "succeeded");
      if (deadlineController.signal.aborted) throw new HardDeadlineReached();

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
        reason: "本次采用放宽模式：结构化外壳保持确定性，分析报告见已校验模型文本。",
        unavailable: false,
      });
      if (analysis.status === "unavailable") return unavailable("现有结构化证据不足以形成可展示报告。");
      return {
        analysis,
        ai_text: reports.rational,
        ai_theme_text: reports.persona,
        rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
        source: { kind: "live", is_live: true, label: "实时行情 + 模型分析" },
      };
    } catch (error) {
      if (!(error instanceof HardDeadlineReached)) throw error;
      input.emit(activeStage, "timed_out", {
        message: `复盘达到 ${Math.ceil(hardDeadlineMs / 1_000)} 秒整体硬截止，迟到结果已隔离。`,
      });
      return unavailable("复盘达到整体硬截止，所有未完成外部调用与生成文本已终止。");
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

  private async collectEvidence(
    snapshot: PortfolioSnapshot,
    tradingDay: string,
    timeoutMs: number,
    now: () => Date,
    deadlineSignal: AbortSignal,
  ): Promise<EvidenceRecord[]> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = AbortSignal.any([deadlineSignal, timeoutController.signal]);
    try {
      const batches = await waitForAbort(Promise.all(
        snapshot.lines.map((line) =>
          this.dependencies.marketEvidenceSource
            .collectMarketEvidence({
              lineId: line.line_id,
              assetClass: line.asset_class,
              symbol: line.symbol,
              acquiredAt: now().toISOString(),
              latestCompleteTradingDay: tradingDay,
              signal,
            })
            .catch((error: unknown) => {
              if (deadlineSignal.aborted) throw error;
              return [] as EvidenceRecord[];
            }),
        ),
      ), signal);
      return normalizeMarketEvidenceDates(omitDuplicateEvidenceIds(batches.flat()), tradingDay);
    } catch (error) {
      if (deadlineSignal.aborted) throw new HardDeadlineReached();
      if (error instanceof HardDeadlineReached && timeoutController.signal.aborted) return [];
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async streamModelText(
    snapshot: PortfolioSnapshot,
    evidence: readonly EvidenceRecord[],
    timeoutMs: number,
    deadlineSignal: AbortSignal,
    onDelta: (delta: string) => void,
  ): Promise<string> {
    const gateway = this.dependencies.modelGateway;
    if (!gateway.streamGenerate) return "";
    if (timeoutMs <= 0 || deadlineSignal.aborted) throw new HardDeadlineReached();
    try {
      const compiled = compileStreamingReviewInstructions(snapshot.theme_id);
      const result = await waitForAbort(gateway.streamGenerate({
        instructions: compiled.instructions,
        prompt: buildPrompt(snapshot, evidence),
        signal: deadlineSignal,
        timeoutMs,
        onText: (delta) => {
          if (!deadlineSignal.aborted) onDelta(delta);
        },
      }), deadlineSignal);
      return result.ok ? result.text : "";
    } catch {
      if (deadlineSignal.aborted) throw new HardDeadlineReached();
      return "";
    }
  }

}
