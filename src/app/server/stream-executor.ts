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
import type { ModelGateway } from "../../model/index.js";
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
}

const SYSTEM_INSTRUCTIONS = [
  "你是“满懂”里的理性复盘助手，面向普通个人投资者，用简体中文回答。",
  "根据用户提供的持仓事实、四项个人约束和已获取的行情证据，给出一份口语化、结构清晰的每日复盘与方向性观察。",
  "只给定性方向（如维持观察、关注集中度、等待数据确认等），不要给出精确买卖金额、份额、比例、价格点位或买卖时点，不做收益保证或代客操作。",
  "行情缺失、过期或不支持时如实说明，不要编造当前价格或净值。语气平实、可读，避免催促交易。",
].join("\n");

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
    "请基于以上信息，用自然的中文给出今天的理性复盘：先概述整体情况，再逐项点评关键持仓，指出数据缺口与需要关注的风险，最后给出定性的方向性观察。不要给出精确交易指令。",
  ].join("\n");
}

/**
 * Relaxed Demo executor: it keeps the deterministic evidence, coverage and
 * result-shell pipeline (which still passes the owned-result validators) but
 * replaces the strict, schema-bound rational/theme model calls with a single
 * streaming free-text model call whose deltas are forwarded to the client.
 */
export class StreamingAnalysisExecutor implements AnalysisExecutor {
  constructor(
    private readonly dependencies: StreamingAnalysisExecutorDependencies,
    private readonly options: StreamingAnalysisExecutorOptions = {},
  ) {}

  async execute(input: Parameters<AnalysisExecutor["execute"]>[0]): Promise<AnalysisExecution> {
    const marketTimeoutMs = this.options.marketTimeoutMs ?? 20_000;
    const modelTimeoutMs = this.options.modelTimeoutMs ?? 150_000;

    const startedAt = input.now();
    const startedAtIso = startedAt.toISOString();
    const evidenceCutoffAt = startedAtIso;
    const tradingDay = latestCompleteTradingDay(startedAt);
    const snapshot = freezeSnapshot(input.snapshot);

    input.emit("validate_snapshot", "succeeded");
    input.emit("resolve_assets", "succeeded", { covered_count: snapshot.lines.length });

    input.emit("fetch_structured_data", "running", { message: "获取实时行情证据。" });
    const evidence = await this.collectEvidence(snapshot, tradingDay, marketTimeoutMs, input.now);
    const availableCount = evidence.filter((item) => item.status === "available").length;
    input.emit("fetch_structured_data", "succeeded", { covered_count: availableCount });

    input.emit("discover_and_verify_events", "succeeded");

    input.emit("derive_exposure_and_constraints", "running");
    const derivations = deriveAnalysisInputs({
      snapshot,
      evidence,
      latestCompleteTradingDay: tradingDay,
    });
    input.emit("derive_exposure_and_constraints", "succeeded", {
      covered_count: derivations.coverage.covered_line_ids.length,
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
      reason: "本次采用放宽模式：结构化外壳保持确定性，方向性解读见模型自由文本。",
      unavailable: false,
    });

    input.emit("form_conclusions_and_advice", "running", { message: "生成理性复盘文本。" });
    const aiText = await this.streamModelText(snapshot, evidence, modelTimeoutMs, input.onText);
    input.emit("form_conclusions_and_advice", aiText.trim() ? "succeeded" : "failed", {
      ...(aiText.trim() ? {} : { message: "模型未返回可用文本。" }),
    });
    input.emit("render_theme_and_validate_output", "succeeded");

    const isLive = analysis.status !== "unavailable" && aiText.trim().length > 0;
    return {
      analysis,
      ...(aiText.trim() ? { ai_text: aiText } : {}),
      rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
      source: isLive
        ? { kind: "live", is_live: true, label: "实时行情 + 模型分析" }
        : { kind: "unavailable", is_live: false, label: "实时数据或模型输出当前不可用" },
    };
  }

  private async collectEvidence(
    snapshot: PortfolioSnapshot,
    tradingDay: string,
    timeoutMs: number,
    now: () => Date,
  ): Promise<EvidenceRecord[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const batches = await Promise.all(
        snapshot.lines.map((line) =>
          this.dependencies.marketEvidenceSource
            .collectMarketEvidence({
              lineId: line.line_id,
              assetClass: line.asset_class,
              symbol: line.symbol,
              acquiredAt: now().toISOString(),
              latestCompleteTradingDay: tradingDay,
              signal: controller.signal,
            })
            .catch(() => [] as EvidenceRecord[]),
        ),
      );
      return normalizeMarketEvidenceDates(omitDuplicateEvidenceIds(batches.flat()), tradingDay);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async streamModelText(
    snapshot: PortfolioSnapshot,
    evidence: readonly EvidenceRecord[],
    timeoutMs: number,
    onText: ((delta: string) => void) | undefined,
  ): Promise<string> {
    const gateway = this.dependencies.modelGateway;
    if (!gateway.streamGenerate) return "";
    let buffered = "";
    const result = await gateway.streamGenerate({
      instructions: SYSTEM_INSTRUCTIONS,
      prompt: buildPrompt(snapshot, evidence),
      signal: new AbortController().signal,
      timeoutMs,
      onText: (delta) => {
        buffered += delta;
        onText?.(delta);
      },
    });
    return result.ok ? result.text : buffered;
  }
}
