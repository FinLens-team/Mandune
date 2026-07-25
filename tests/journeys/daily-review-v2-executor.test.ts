import { describe, expect, it, vi } from "vitest";
import {
  GENERATED_DAILY_REVIEW_SCHEMA_VERSION,
  type ReviewPacketV2,
} from "../../src/analysis/index.js";
import {
  DailyReviewV2Executor,
  type AnalysisExecution,
} from "../../src/app/server/index.js";
import {
  ATLAS_CANDIDATE_SCHEMA_VERSION,
  selectAtlasKind,
  type AtlasCardKind,
} from "../../src/atlas/index.js";
import type { EvidenceRecord, TaskEvent } from "../../src/contracts/index.js";
import { getFixture } from "../../src/fixtures/index.js";
import { HistoryService } from "../../src/history/index.js";
import type { ModelGateway, ModelGatewayRequest } from "../../src/model/index.js";

const NOW = new Date("2026-07-25T09:00:00.000Z");

function modelCandidate(kind: AtlasCardKind, referenceId: string) {
  return kind === "meme" ? {
    schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
    kind,
    canonical_name: "情绪先坐下",
    aliases: [],
    scope_labels: [],
    generation_mode: "model",
    domain: null,
    meme_text: "数字还没说完，情绪先别抢麦。",
    plain_explanation: "先读完信息，再形成判断。",
    theme: "通用梗",
  } : {
    schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
    kind,
    canonical_name: "组合集中度",
    aliases: ["持仓集中度"],
    scope_labels: ["示例组合"],
    generation_mode: "model",
    domain: "portfolio",
    plain_explanation: "描述组合是否集中在少数持仓。",
    why_today: "用于解释本次已确认的组合观察。",
    relation: "对应本次复盘引用的事实。",
    misconception: "集中不等于必然亏损。",
    boundary: "不能单独判断未来涨跌。",
    reference_ids: [referenceId],
  };
}

function modelOutput(packet: ReviewPacketV2) {
  const referenceId = packet.fact_ids[0]!;
  return {
    schema_version: GENERATED_DAILY_REVIEW_SCHEMA_VERSION,
    rational_report: {
      markdown: "当前证据支持复盘组合变化，同时仍需保留未知边界。",
      fact_ids: [referenceId],
      event_ids: [],
    },
    persona_report: {
      persona_id: packet.persona_id,
      markdown: "兜兜先看清已确认的组合变化，也把未知之处原样留着。",
      fact_ids: [referenceId],
      event_ids: [],
    },
    atlas_candidate: modelCandidate(packet.atlas.selected_kind, referenceId),
  };
}

function availableEvidence(): EvidenceRecord[] {
  return structuredClone(getFixture("supported_full").analysis.evidence);
}

function failedEvidence(): EvidenceRecord[] {
  return getFixture("supported_full").snapshot.lines.map((line) => ({
    id: `failed-${line.line_id}`,
    scope: { kind: "asset" as const, line_id: line.line_id, symbol: line.symbol },
    metric_or_event_type: line.asset_class === "fund" ? "nav" : "close",
    value: null,
    source: { name: "PandaAI", locator: `pandaai:failed:${line.symbol}` },
    observation_or_event_time: "2026-07-24",
    fetched_at: NOW.toISOString(),
    status: "failed" as const,
    limitations: ["供应商失败。"],
    provenance: "observed" as const,
  }));
}

async function execute(input: {
  gateway: ModelGateway;
  evidence?: EvidenceRecord[];
  failures?: { lineId: string; status: "failed"; errorCode?: string }[];
}): Promise<{ result: AnalysisExecution; events: Array<Pick<TaskEvent, "stage" | "state">> }> {
  const events: Array<Pick<TaskEvent, "stage" | "state">> = [];
  const executor = new DailyReviewV2Executor({
    modelGateway: input.gateway,
    marketEvidenceCollector: {
      collect: async () => ({ evidence: input.evidence ?? availableEvidence(), failures: input.failures ?? [] }),
    },
    eventEvidenceCollector: {
      collect: async () => ({ evidence: [], searchFailures: [] }),
    },
    listAtlasCards: async () => [],
  }, { modelTimeoutMs: 10_000, hardDeadlineMs: 20_000 });
  const result = await executor.execute({
    workspaceId: "workspace-v2",
    analysisId: "analysis-daily-review-v2",
    snapshot: structuredClone(getFixture("supported_full").snapshot),
    emit: (stage, state) => events.push({ stage, state }),
    now: () => new Date(NOW),
  });
  return { result, events };
}

describe("DailyReviewV2Executor", () => {
  it("uses exactly one structured model call for both reports and the selected Atlas kind", async () => {
    const requests: ModelGatewayRequest[] = [];
    const generate = vi.fn(async <T>(request: ModelGatewayRequest) => {
      requests.push(request);
      return { ok: true as const, value: modelOutput(request.input as ReviewPacketV2) as T, finishReason: "stop" };
    });

    const { result } = await execute({ gateway: { generate: generate as ModelGateway["generate"] } });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(requests[0]).toMatchObject({
      operation: "daily_review_v2",
      schemaVersion: GENERATED_DAILY_REVIEW_SCHEMA_VERSION,
    });
    expect(result).toMatchObject({
      ai_text: "当前证据支持复盘组合变化，同时仍需保留未知边界。",
      ai_theme_text: "兜兜先看清已确认的组合变化，也把未知之处原样留着。",
      model_id: "step-explore",
      prompt_version: "daily-review-prompt.v2",
      source: { kind: "live", is_live: true },
      generated_review: {
        atlas_candidate: { kind: selectAtlasKind("analysis-daily-review-v2") },
      },
      review_packet: { latest_complete_trading_day: "2026-07-23" },
    });
  });

  it("retries the same structured operation once after an invalid report", async () => {
    let call = 0;
    const generate = vi.fn(async <T>(request: ModelGatewayRequest) => {
      call += 1;
      const value = modelOutput(request.input as ReviewPacketV2);
      if (call === 1) value.rational_report.markdown = "现在卖出。";
      return { ok: true as const, value: value as T, finishReason: "stop" };
    });

    const { result } = await execute({ gateway: { generate: generate as ModelGateway["generate"] } });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.source.kind).toBe("live");
  });

  it("keeps valid reports and drops an invalid Atlas subobject without another call", async () => {
    const generate = vi.fn(async <T>(request: ModelGatewayRequest) => {
      const value = modelOutput(request.input as ReviewPacketV2);
      value.atlas_candidate.kind = value.atlas_candidate.kind === "meme" ? "professional_term" : "meme";
      return { ok: true as const, value: value as T, finishReason: "stop" };
    });

    const { result, events } = await execute({ gateway: { generate: generate as ModelGateway["generate"] } });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.source.kind).toBe("live");
    expect(result.generated_review).toMatchObject({ atlas_candidate: null, atlas_validation: "invalid_candidate" });
    expect(events).toContainEqual({ stage: "render_theme_and_validate_output", state: "failed" });
  });

  it("does not call the model when every market line failed", async () => {
    const generate = vi.fn();
    const evidence = failedEvidence();
    const failures = getFixture("supported_full").snapshot.lines.map((line) => ({
      lineId: line.line_id,
      status: "failed" as const,
      errorCode: "provider_failed",
    }));

    const { result } = await execute({ gateway: { generate: generate as ModelGateway["generate"] }, evidence, failures });

    expect(generate).not.toHaveBeenCalled();
    expect(result.analysis.status).toBe("unavailable");
    expect(result.generated_review).toBeUndefined();
  });

  it("generates honestly when only part of the market batch failed", async () => {
    const evidence = [failedEvidence()[0]!, availableEvidence()[1]!];
    const generate = vi.fn(async <T>(request: ModelGatewayRequest) => ({
      ok: true as const,
      value: modelOutput(request.input as ReviewPacketV2) as T,
      finishReason: "stop",
    }));

    const { result } = await execute({
      gateway: { generate: generate as ModelGateway["generate"] },
      evidence,
      failures: [{ lineId: "line-etf-300", status: "failed", errorCode: "provider_failed" }],
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.analysis.status).toBe("limited");
    expect(result.review_packet?.coverage.uncovered_line_ids).toContain("line-etf-300");
  });

  it("persists and replays the packet, generated reports and generation versions without rerunning", async () => {
    const generate = vi.fn(async <T>(request: ModelGatewayRequest) => ({
      ok: true as const,
      value: modelOutput(request.input as ReviewPacketV2) as T,
      finishReason: "stop",
    }));
    const { result } = await execute({
      gateway: { generate: generate as ModelGateway["generate"] },
    });
    if (!result.review_packet || !result.generated_review || !result.model_id ||
      !result.prompt_version || !result.skill_versions || !result.atlas_policy_version) {
      throw new Error("missing_v2_result");
    }
    const snapshot = structuredClone(getFixture("supported_full").snapshot);
    const history = new HistoryService();
    const controller = new AbortController();
    await history.createResultSink("workspace-v2-history", snapshot).save({
      analysis: result.analysis,
      rational_analysis_version: result.rational_analysis_version,
      ai_text: result.ai_text,
      ai_theme_text: result.ai_theme_text,
      review_packet: result.review_packet,
      generated_review: result.generated_review,
      model_id: result.model_id,
      prompt_version: result.prompt_version,
      skill_versions: result.skill_versions,
      atlas_policy_version: result.atlas_policy_version,
    }, { signal: controller.signal, canCommit: () => true });

    const replay = await history.replay("workspace-v2-history", result.analysis.analysis_id);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(replay).toMatchObject({
      status: "replayed",
      source: "immutable_history",
      record: {
        review_packet: { schema_version: "review-packet.v2" },
        generated_review: { schema_version: GENERATED_DAILY_REVIEW_SCHEMA_VERSION },
        model_id: "step-explore",
        prompt_version: "daily-review-prompt.v2",
        atlas_policy_version: "atlas-generation-policy.v1",
      },
    });
  });
});
