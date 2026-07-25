import {
  deriveAnalysisInputs,
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  type MarketEvidenceSource,
} from "../../analysis/index.js";
import {
  fallbackAnalysis,
  freezeSnapshot,
  normalizeMarketEvidenceDates,
  omitDuplicateEvidenceIds,
} from "../../analysis/runtime.js";
import type { EvidenceRecord, PortfolioSnapshot } from "../../contracts/index.js";
import { hasPrivatePayload, type ModelGateway } from "../../model/index.js";
import { latestCompleteTradingDay } from "./live-executor.js";
import type { AnalysisExecution, AnalysisExecutor } from "./types.js";

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

const SYSTEM_INSTRUCTIONS = [
  "你是“满懂”里的理性分析师，面向普通个人投资者，用简体中文撰写一份正式的每日持仓分析报告。",
  "根据用户提供的持仓事实、四项个人约束和已获取的行情证据，按“整体情况→逐项分析→风险与缺口→方向性观察”的顺序组织内容，语气专业、条理清晰。",
  "只给定性方向（如维持观察、关注集中度、等待数据确认等），不要给出精确买卖金额、份额、比例、价格点位或买卖时点，不做收益保证或代客操作。",
  "行情缺失、过期或不支持时如实说明，不要编造当前价格或净值。避免催促交易。",
].join("\n");

const THEME_PREFIX = [
  "> 奶龙陪你看看今天的持仓，先读已核验的理性分析。",
  "",
  "<!-- MANDONG_RATIONAL_REPORT_START -->",
].join("\n");
const THEME_SUFFIX = [
  "<!-- MANDONG_RATIONAL_REPORT_END -->",
  "",
  "> 主题只改变表达，不改变事实、风险与方向性观察。",
].join("\n");

const NUMBER = "(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千万亿]+)";
const TRADE_ACTION = "(?:买入|卖出|建仓|清仓|加仓|减仓|申购|赎回|调仓|下单)";
const FORBIDDEN_FREE_TEXT: RegExp[] = [
  new RegExp(`${TRADE_ACTION}[^。；\\n]{0,24}(?:${NUMBER}\\s*(?:%|％|元|块|万元|亿元|股|份|手)|百分之\\s*${NUMBER})`),
  new RegExp(`(?:${NUMBER}\\s*(?:%|％|元|块|万元|亿元|股|份|手)|百分之\\s*${NUMBER})[^。；\\n]{0,24}${TRADE_ACTION}`),
  new RegExp(`(?:目标价|交易价|买入价|卖出价|价位|点位)\\s*(?:为|在|到|约|：|:)?\\s*${NUMBER}`),
  new RegExp(`(?:明天|后天|下周[一二三四五六日天]|开盘|收盘|上午|下午|今晚|明早)[^。；\\n]{0,24}${TRADE_ACTION}`),
  /(?:保证|确保|承诺).{0,10}(?:收益|回报|盈利|不亏|胜率)|(?:稳赚|必赚|保本|必涨|必跌|稳赢)/,
  /(?:代客操作|替你下单|自动下单|执行交易|持牌投资建议|专业投资建议)/,
  /(?:吉凶|运势|天命|卦象)/,
];

class HardDeadlineReached extends Error {}

function generatedTextIsSafe(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !hasPrivatePayload(trimmed) &&
    FORBIDDEN_FREE_TEXT.every((pattern) => !pattern.test(trimmed));
}

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
): { finish: () => void; push: (delta: string) => void } {
  let pending = "";
  const seen = new Set<string>();

  function consume(line: string): void {
    const match = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line);
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
  };
}

function renderThemeText(rationalReport: string): string {
  return `${THEME_PREFIX}\n${rationalReport}\n${THEME_SUFFIX}`;
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
    "请基于以上信息撰写今天的理性分析报告：先概述整体情况，再逐项分析关键持仓，指出数据缺口与需要关注的风险，最后给出定性的方向性观察。不要给出精确交易指令。",
  ].join("\n");
}

/**
 * Relaxed Demo executor: it keeps the deterministic evidence, coverage and
 * result-shell pipeline (which still passes the owned-result validators) but
  * replaces the strict, schema-bound model calls with one free-text model call.
  * The fixed theme frame is rendered locally so it cannot alter the report or
  * add a second model round trip.
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
      input.emit(activeStage, "running", { message: "生成并校验理性分析报告。" });
      const headings = createHeadingProgressReporter((message) => {
        input.emit(activeStage, "running", { message });
        input.onText?.(`# ${message.slice("正在生成 ".length)}\n`);
      }, snapshot.lines.flatMap((line) => [line.name.trim(), line.symbol.trim()]));
      const aiText = await this.streamModelText(
        snapshot,
        evidence,
        Math.min(modelTimeoutMs, this.remainingMs(deadlineAt)),
        deadlineController.signal,
        headings.push,
      );
      headings.finish();
      if (!generatedTextIsSafe(aiText)) {
        input.emit(activeStage, "failed", { message: "模型文本未通过完整内容边界校验。" });
        input.emit("render_theme_and_validate_output", "failed", { message: "未校验理性报告不生成主题表达。" });
        return unavailable("模型文本未通过完整内容边界校验，未展示或保存生成文本。");
      }
      if (deadlineController.signal.aborted) throw new HardDeadlineReached();
      input.emit(activeStage, "succeeded");

      activeStage = "render_theme_and_validate_output";
      input.emit(activeStage, "running", { message: "渲染“我是龙”主题表达。" });
      const themeText = renderThemeText(aiText);
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
        ai_text: aiText,
        ai_theme_text: themeText,
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
      const result = await waitForAbort(gateway.streamGenerate({
        instructions: SYSTEM_INSTRUCTIONS,
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
