import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  generateText,
  hasToolCall,
  isStepCount,
  jsonSchema,
  tool,
} from "ai";
import {
  deriveAnalysisInputs,
  type AnalysisDerivations,
  type MarketEvidenceSource,
} from "../analysis/index.js";
import type { EvidenceRecord, PortfolioSnapshot } from "../contracts/index.js";
import { hasPrivatePayload } from "../model/privacy.js";
import { latestCompleteTradingDay } from "../app/server/live-executor.js";
import {
  A2A_DEEP_REVIEW_DEADLINE_MS,
  A2A_DEEP_REVIEW_ENDPOINT_ID,
  A2A_DEEP_REVIEW_LOOP_BUDGET_MS,
  A2A_DEEP_REVIEW_MAX_STEPS,
  A2A_DEEP_REVIEW_MODEL_ID,
  A2A_DEEP_REVIEW_MODEL_NAME,
  A2A_DEEP_REVIEW_PROVIDER,
  A2A_DEEP_REVIEW_SCHEMA_VERSION,
  A2A_RISK_NOTICE,
  type DeepReviewFinalDraft,
  type DeepReviewInput,
  type DeepReviewOutput,
  type DeepReviewRunner,
  type DeepReviewStopReason,
  type DeepReviewToolTrace,
} from "./types.js";

export interface DeepSeekDeepReviewAgentConfig {
  baseURL: string;
  apiKey: string;
  modelId: typeof A2A_DEEP_REVIEW_MODEL_ID;
  marketEvidenceSource: MarketEvidenceSource;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Test/diagnostic hook. Production composition intentionally leaves this unset. */
  onError?: (phase: "loop" | "summary", error: unknown) => void;
}

interface FinalizeToolInput {
  summary: string;
  observations: string[];
  unknowns: string[];
  limitations: string[];
}

const EMPTY_OBJECT_SCHEMA = jsonSchema<Record<string, never>>({
  type: "object",
  properties: {},
  additionalProperties: false,
});

const MARKET_TOOL_SCHEMA = jsonSchema<{ symbols: string[] }>({
  type: "object",
  properties: {
    symbols: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 32 },
    },
  },
  required: ["symbols"],
  additionalProperties: false,
});

const FINALIZE_TOOL_SCHEMA = jsonSchema<FinalizeToolInput>({
  type: "object",
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 6000 },
    observations: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 1000 },
    },
    unknowns: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 1000 },
    },
    limitations: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 1000 },
    },
  },
  required: ["summary", "observations", "unknowns", "limitations"],
  additionalProperties: false,
});

const AGENT_INSTRUCTIONS = [
  "你是满懂的深度复盘 Agent。只处理本次请求，不建立跨请求记忆。",
  "必须先调用 inspect_context。若存在组合快照，按需调用 collect_market_evidence，再调用 derive_portfolio。",
  "结构化行情和派生结果是事实边界；不得编造当前值、来源、因果或用户约束。",
  "只能给方向性观察，不得给精确金额、份额、比例、价格、买卖时点或收益保证。",
  "完成核对后必须调用 finalize。不要输出思维链；工具参数和工具结果会由服务端记录与校验。",
].join("\n");

const SUMMARY_INSTRUCTIONS = [
  "你是满懂深度复盘的最终编辑器。",
  "根据服务端提供的任务、已确认组合、工具轨迹、证据、确定性派生和候选草稿，总结所有已取得上下文。",
  "不得新增证据区没有的事实，不得把未知写成已知，不得给精确交易指令或收益保证。",
  "只输出可直接展示的简体中文最终总结，不输出 JSON、协议字段、思维链或过程说明。",
].join("\n");

function boundedStrings(value: unknown, maxItems = 20, maxLength = 1_000): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLength));
}

function sanitizeDraft(value: FinalizeToolInput): DeepReviewFinalDraft {
  return {
    summary: String(value.summary ?? "").trim().slice(0, 6_000),
    observations: boundedStrings(value.observations),
    unknowns: boundedStrings(value.unknowns),
    limitations: boundedStrings(value.limitations),
  };
}

function uniqueEvidence(items: readonly EvidenceRecord[]): EvidenceRecord[] {
  const byId = new Map<string, EvidenceRecord>();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

const FORBIDDEN_GENERATED_SUMMARY =
  /(保证收益|稳赚|必涨|必跌|代客操作|替你下单|持牌投资建议|吉凶|运势)/u;
const FORBIDDEN_PRECISE_TRADE =
  /(买入|卖出|建仓|清仓|加仓|减仓)[^。；\n]{0,24}(\d|%|元|股|份|手)|目标价\s*\d|仓位[^。；\n]{0,12}\d+(\.\d+)?\s*%/u;

function generatedDraftIsAllowed(draft: DeepReviewFinalDraft): boolean {
  const text = [draft.summary, ...draft.observations, ...draft.unknowns, ...draft.limitations]
    .join("\n");
  return !hasPrivatePayload(text) &&
    !FORBIDDEN_GENERATED_SUMMARY.test(text) &&
    !FORBIDDEN_PRECISE_TRADE.test(text);
}

function usedSkills(traces: readonly DeepReviewToolTrace[]): DeepReviewToolTrace["name"][] {
  return [...new Set(traces.map((item) => item.name))];
}

function summarizeDataSources(evidence: readonly EvidenceRecord[]) {
  const byName = new Map<string, { evidenceIds: Set<string>; statuses: Set<EvidenceRecord["status"]> }>();
  for (const item of evidence) {
    const existing = byName.get(item.source.name) ?? {
      evidenceIds: new Set<string>(),
      statuses: new Set<EvidenceRecord["status"]>(),
    };
    existing.evidenceIds.add(item.id);
    existing.statuses.add(item.status);
    byName.set(item.source.name, existing);
  }
  return [...byName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, summary]) => ({
      name,
      evidence_ids: [...summary.evidenceIds].sort(),
      statuses: [...summary.statuses].sort(),
    }));
}

function fallbackDraft(
  task: string,
  snapshot: PortfolioSnapshot | undefined,
  evidence: readonly EvidenceRecord[],
  derivations: AnalysisDerivations | null,
): DeepReviewFinalDraft {
  const holdings = snapshot?.lines.length ?? 0;
  const available = evidence.filter((item) => item.status === "available").length;
  return {
    summary: snapshot
      ? `已围绕“${task}”核对 ${holdings} 项确认持仓，取得 ${available} 项可用证据。模型最终总结未完成，以下结构保留已确认上下文。`
      : `已接收任务“${task}”，但没有提供可校验的组合快照，因此只能总结任务边界。`,
    observations: derivations
      ? [`当前确定性覆盖状态为 ${derivations.status}。`]
      : [],
    unknowns: derivations
      ? derivations.unknowns.map((item) => `${item.subject}：${item.reason}`)
      : snapshot ? ["尚未完成确定性派生。"] : ["未提供 PortfolioSnapshot。"],
    limitations: [
      ...(derivations?.limitations ?? []),
      "最终文本使用服务端确定性降级汇总，不包含未经校验的部分模型输出。",
    ],
  };
}

export class DeepSeekDeepReviewAgent implements DeepReviewRunner {
  private readonly now: () => Date;

  constructor(private readonly config: DeepSeekDeepReviewAgentConfig) {
    this.now = config.now ?? (() => new Date());
  }

  async run(input: DeepReviewInput): Promise<DeepReviewOutput> {
    const started = this.now();
    const startedAt = started.toISOString();
    const absoluteDeadline = started.getTime() + A2A_DEEP_REVIEW_DEADLINE_MS;
    const deadlineController = new AbortController();
    const deadlineTimer = setTimeout(
      () => deadlineController.abort(),
      A2A_DEEP_REVIEW_DEADLINE_MS,
    );
    const overallSignal = AbortSignal.any([input.signal, deadlineController.signal]);
    const loopController = new AbortController();
    const loopTimer = setTimeout(
      () => loopController.abort(),
      A2A_DEEP_REVIEW_LOOP_BUDGET_MS,
    );
    const loopSignal = AbortSignal.any([overallSignal, loopController.signal]);
    const evidence: EvidenceRecord[] = [];
    const traces: DeepReviewToolTrace[] = [];
    let derivations: AnalysisDerivations | null = null;
    let finalDraft: DeepReviewFinalDraft | null = null;
    let steps = 0;
    let stopReason: DeepReviewStopReason = "completed";

    const provider = createOpenAICompatible({
      name: "mandong-a2a-volcano-ark",
      baseURL: this.config.baseURL,
      apiKey: this.config.apiKey,
      supportsStructuredOutputs: true,
      ...(this.config.fetch ? { fetch: this.config.fetch } : {}),
    });

    const trace = async (
      name: DeepReviewToolTrace["name"],
      action: () => Promise<{
        value: unknown;
        summary: string;
        status?: DeepReviewToolTrace["status"];
      }>,
    ): Promise<unknown> => {
      const toolStarted = this.now().toISOString();
      try {
        const result = await action();
        traces.push({
          name,
          status: result.status ?? "succeeded",
          started_at: toolStarted,
          completed_at: this.now().toISOString(),
          summary: result.summary,
        });
        return result.value;
      } catch (error) {
        traces.push({
          name,
          status: "failed",
          started_at: toolStarted,
          completed_at: this.now().toISOString(),
          summary: error instanceof Error ? error.name : "tool_failure",
        });
        throw error;
      }
    };

    const tools = {
      inspect_context: tool({
        description: "读取本次已授权任务和可选组合快照的结构化摘要。必须首先调用。",
        inputSchema: EMPTY_OBJECT_SCHEMA,
        execute: async () => trace("inspect_context", async () => ({
          value: {
            task: input.task,
            snapshot: input.snapshot
              ? {
                  snapshot_id: input.snapshot.snapshot_id,
                  holdings: input.snapshot.lines,
                  constraints: input.snapshot.constraints,
                }
              : null,
          },
          summary: input.snapshot
            ? `已检查 ${input.snapshot.lines.length} 项确认持仓。`
            : "本次请求没有组合快照。",
        })),
      }),
      collect_market_evidence: tool({
        description: "仅为当前快照内指定资产查询公开结构化行情；没有快照或资产不在快照时拒绝。",
        inputSchema: MARKET_TOOL_SCHEMA,
        execute: async ({ symbols }, options) => trace("collect_market_evidence", async () => {
          if (!input.snapshot) {
            return {
              value: { status: "rejected", reason: "snapshot_required", evidence: [] },
              summary: "没有组合快照，拒绝行情查询。",
              status: "rejected",
            };
          }
          const allowed = new Map(input.snapshot.lines.map((line) => [line.symbol.toUpperCase(), line]));
          const requested = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))];
          const denied = requested.filter((symbol) => !allowed.has(symbol));
          if (denied.length > 0) {
            return {
              value: { status: "rejected", reason: "asset_out_of_scope", denied, evidence: [] },
              summary: "请求包含快照外资产，整次行情工具调用被拒绝。",
              status: "rejected",
            };
          }
          const acquiredAt = this.now().toISOString();
          const tradingDay = latestCompleteTradingDay(this.now());
          const batches = await Promise.all(requested.map(async (symbol) => {
            const line = allowed.get(symbol)!;
            return this.config.marketEvidenceSource.collectMarketEvidence({
              lineId: line.line_id,
              assetClass: line.asset_class,
              symbol: line.symbol,
              acquiredAt,
              latestCompleteTradingDay: tradingDay,
              signal: options.abortSignal ?? loopSignal,
            });
          }));
          evidence.splice(0, evidence.length, ...uniqueEvidence([...evidence, ...batches.flat()]));
          return {
            value: { status: "completed", evidence },
            summary: `已为 ${requested.length} 项快照内资产取得 ${batches.flat().length} 条证据记录。`,
          };
        }),
      }),
      derive_portfolio: tool({
        description: "使用已确认快照和当前已取得证据运行确定性覆盖、未知项与约束派生。",
        inputSchema: EMPTY_OBJECT_SCHEMA,
        execute: async () => trace("derive_portfolio", async () => {
          if (!input.snapshot) {
            return {
              value: { status: "rejected", reason: "snapshot_required" },
              summary: "没有组合快照，拒绝组合派生。",
              status: "rejected",
            };
          }
          derivations = deriveAnalysisInputs({
            snapshot: input.snapshot,
            evidence,
            latestCompleteTradingDay: latestCompleteTradingDay(this.now()),
          });
          return {
            value: derivations,
            summary: `已生成 ${derivations.derived.length} 项确定性派生，状态为 ${derivations.status}。`,
          };
        }),
      }),
      finalize: tool({
        description: "提交最终总结草稿。完成必要核对后必须调用；不得新增证据或精确交易指令。",
        inputSchema: FINALIZE_TOOL_SCHEMA,
        execute: async (value) => trace("finalize", async () => {
          finalDraft = sanitizeDraft(value);
          return {
            value: finalDraft,
            summary: "已提交最终总结草稿。",
          };
        }),
      }),
    };

    try {
      const exploration = await generateText({
        model: provider(this.config.modelId),
        instructions: AGENT_INSTRUCTIONS,
        prompt: input.snapshot
          ? `任务：${input.task}\n已提供一份通过服务端校验的组合快照。请使用工具完成深度复盘。`
          : `任务：${input.task}\n没有提供组合快照。请检查上下文并在边界内总结，不要假设持仓。`,
        tools,
        stopWhen: [hasToolCall("finalize"), isStepCount(A2A_DEEP_REVIEW_MAX_STEPS)],
        abortSignal: loopSignal,
        timeout: A2A_DEEP_REVIEW_LOOP_BUDGET_MS,
        maxRetries: 1,
        temperature: 0.2,
        onStepFinish: () => {
          steps += 1;
        },
      });
      steps = exploration.steps.length;
      stopReason = finalDraft
        ? "finalized"
        : steps >= A2A_DEEP_REVIEW_MAX_STEPS ? "step_limit" : "completed";
    } catch (error) {
      this.config.onError?.("loop", error);
      if (input.signal.aborted) stopReason = "cancelled";
      else if (deadlineController.signal.aborted) stopReason = "deadline";
      else if (loopController.signal.aborted) stopReason = "loop_timeout";
      else stopReason = "model_failure";
    } finally {
      clearTimeout(loopTimer);
    }

    if (input.snapshot && !derivations) {
      derivations = deriveAnalysisInputs({
        snapshot: input.snapshot,
        evidence,
        latestCompleteTradingDay: latestCompleteTradingDay(this.now()),
      });
    }

    let final = finalDraft && generatedDraftIsAllowed(finalDraft)
      ? finalDraft
      : fallbackDraft(input.task, input.snapshot, evidence, derivations);
    if (finalDraft && !generatedDraftIsAllowed(finalDraft)) {
      final.limitations = [
        ...final.limitations,
        "模型候选总结触发内容边界，已由服务端拒绝并使用确定性降级汇总。",
      ];
    }
    const remainingMs = Math.max(0, absoluteDeadline - this.now().getTime());
    if (!input.signal.aborted && remainingMs > 1_000) {
      try {
        const summaryResult = await generateText({
          model: provider(this.config.modelId),
          instructions: SUMMARY_INSTRUCTIONS,
          prompt: JSON.stringify({
            task: input.task,
            snapshot: input.snapshot ?? null,
            tools: traces,
            evidence,
            derivations,
            candidate: final,
          }),
          abortSignal: overallSignal,
          timeout: remainingMs,
          maxRetries: 1,
          temperature: 0.2,
        });
        const candidate = { ...final, summary: summaryResult.text.trim().slice(0, 8_000) };
        if (candidate.summary && generatedDraftIsAllowed(candidate)) {
          final = candidate;
        } else if (candidate.summary) {
          final.limitations = [
            ...final.limitations,
            "模型最终总结触发内容边界，未展示该文本。",
          ];
        }
      } catch (error) {
        this.config.onError?.("summary", error);
        if (input.signal.aborted) stopReason = "cancelled";
        else if (deadlineController.signal.aborted) stopReason = "deadline";
      }
    }

    clearTimeout(deadlineTimer);
    const status = derivations?.status ?? (input.snapshot ? "unavailable" : "observation_only");
    return {
      schema_version: A2A_DEEP_REVIEW_SCHEMA_VERSION,
      status,
      provider: A2A_DEEP_REVIEW_PROVIDER,
      model: A2A_DEEP_REVIEW_MODEL_NAME,
      endpoint_id: A2A_DEEP_REVIEW_ENDPOINT_ID,
      started_at: startedAt,
      completed_at: this.now().toISOString(),
      deadline_ms: A2A_DEEP_REVIEW_DEADLINE_MS,
      stop_reason: stopReason,
      context: {
        task: input.task,
        snapshot_id: input.snapshot?.snapshot_id ?? null,
        holdings: input.snapshot?.lines.map((line) => ({
          line_id: line.line_id,
          asset_class: line.asset_class,
          name: line.name,
          symbol: line.symbol,
          observation_date: line.observation_date,
        })) ?? [],
        constraints: input.snapshot?.constraints ?? null,
      },
      evidence: uniqueEvidence(evidence),
      skills_used: usedSkills(traces),
      data_sources: summarizeDataSources(evidence),
      derivations,
      final,
      risk_notice: A2A_RISK_NOTICE,
      execution: { steps, tools: traces },
    };
  }
}
