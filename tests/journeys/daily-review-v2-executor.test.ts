import { describe, expect, it, vi } from "vitest";
import {
  GENERATED_DAILY_REVIEW_SCHEMA_VERSION,
  GENERATED_PERSONA_REPORT_SCHEMA_VERSION,
  GENERATED_RATIONAL_REPORT_SCHEMA_VERSION,
  type ReviewPacketV2,
} from "../../src/analysis/index.js";
import {
  DailyReviewV2Executor,
  type AnalysisExecution,
} from "../../src/app/server/index.js";
import {
  ATLAS_CANDIDATE_SCHEMA_VERSION,
  ATLAS_GENERATION_POLICY_VERSION,
  ModelAtlasCandidateGenerator,
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

function rationalOutput(packet: ReviewPacketV2) {
  const referenceId = packet.fact_ids[0]!;
  return {
    schema_version: GENERATED_RATIONAL_REPORT_SCHEMA_VERSION,
    rational_report: {
      markdown: "当前证据支持复盘组合变化，同时仍需保留未知边界。",
      fact_ids: [referenceId],
      event_ids: [],
    },
  };
}

function personaOutput(packet: ReviewPacketV2) {
  const referenceId = packet.fact_ids[0]!;
  return {
    schema_version: GENERATED_PERSONA_REPORT_SCHEMA_VERSION,
    persona_report: {
      persona_id: packet.persona_id,
      markdown: "兜兜先看清已确认的组合变化，也把未知之处原样留着。",
      fact_ids: [referenceId],
      event_ids: [],
    },
  };
}

function successfulGateway(options: {
  invalidRational?: boolean;
  invalidPersona?: boolean;
  invalidAtlas?: boolean;
} = {}) {
  const requests: ModelGatewayRequest[] = [];
  let packet: ReviewPacketV2 | undefined;
  const generate = vi.fn(async <T>(request: ModelGatewayRequest) => {
    requests.push(request);
    if (request.operation === "daily_review_rational_v2") {
      packet = request.input as ReviewPacketV2;
      const value = rationalOutput(packet);
      if (options.invalidRational) value.rational_report.markdown = "现在卖出。";
      return { ok: true as const, value: value as T, finishReason: "stop" };
    }
    if (request.operation === "daily_review_persona_v2") {
      const personaInput = request.input as { review_packet: ReviewPacketV2 };
      packet = personaInput.review_packet;
      const value = personaOutput(packet);
      if (options.invalidPersona) value.persona_report.fact_ids = ["unknown-fact"];
      return { ok: true as const, value: value as T, finishReason: "stop" };
    }
    if (!packet) throw new Error("atlas_called_before_reports");
    const value = modelCandidate(packet.atlas.selected_kind, packet.fact_ids[0]!) as unknown as Record<string, unknown>;
    if (options.invalidAtlas) {
      value.generation_mode = "fixture";
    }
    return { ok: true as const, value: { candidates: [value] } as T, finishReason: "stop" };
  });
  return {
    gateway: { generate: generate as ModelGateway["generate"] },
    generate,
    requests,
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
    atlasCandidateGenerator: new ModelAtlasCandidateGenerator(input.gateway),
  }, { modelTimeoutMs: 10_000, hardDeadlineMs: 20_000, maxModelAttempts: 1 });
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
  it("uses three ordered structured calls for rational, persona and Atlas output", async () => {
    const { gateway, generate, requests } = successfulGateway();

    const { result } = await execute({ gateway });

    expect(generate).toHaveBeenCalledTimes(3);
    expect(requests.map((request) => request.operation)).toEqual([
      "daily_review_rational_v2",
      "daily_review_persona_v2",
      "atlas_multi_candidate",
    ]);
    expect(requests[0]).toMatchObject({
      schemaVersion: GENERATED_RATIONAL_REPORT_SCHEMA_VERSION,
      temperature: 0.2,
    });
    expect(requests[1]).toMatchObject({
      schemaVersion: GENERATED_PERSONA_REPORT_SCHEMA_VERSION,
      temperature: 0.8,
    });
    expect(result).toMatchObject({
      ai_text: "当前证据支持复盘组合变化，同时仍需保留未知边界。",
      ai_theme_text: "兜兜先看清已确认的组合变化，也把未知之处原样留着。",
      model_id: "step-explore",
      prompt_version: "daily-review-prompt.v3",
      source: { kind: "live", is_live: true },
      generated_review: {
        atlas_candidate: { kind: selectAtlasKind("analysis-daily-review-v2") },
      },
      review_packet: { latest_complete_trading_day: "2026-07-23" },
    });
  });

  it("stops atomically after an invalid rational report", async () => {
    const { gateway, generate } = successfulGateway({ invalidRational: true });

    const { result } = await execute({ gateway });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.source.kind).toBe("unavailable");
    expect(result.review_packet).toBeUndefined();
    expect(result.generated_review).toBeUndefined();

    const snapshot = structuredClone(getFixture("supported_full").snapshot);
    const history = new HistoryService();
    await history.createResultSink("workspace-v2-unavailable", snapshot).save({
      analysis: result.analysis,
      rational_analysis_version: result.rational_analysis_version,
    }, { signal: new AbortController().signal, canCommit: () => true });
    await expect(history.replay("workspace-v2-unavailable", result.analysis.analysis_id)).resolves.toMatchObject({
      status: "replayed",
      source: "immutable_history",
      record: { analysis: { status: "unavailable" } },
    });
  });

  it("stops before Atlas when the persona changes the rational references", async () => {
    const { gateway, generate } = successfulGateway({ invalidPersona: true });

    const { result } = await execute({ gateway });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.source.kind).toBe("unavailable");
    expect(result.generated_review).toBeUndefined();
  });

  it("keeps valid reports and drops an invalid independent Atlas candidate", async () => {
    const { gateway, generate } = successfulGateway({ invalidAtlas: true });

    const { result, events } = await execute({ gateway });

    expect(generate).toHaveBeenCalledTimes(3);
    expect(result.source.kind).toBe("live");
    expect(result.generated_review).toMatchObject({ atlas_candidate: null, atlas_validation: "invalid_candidate" });
    expect(events).toContainEqual({ stage: "render_theme_and_validate_output", state: "failed" });
  });

  it("generates honestly when only part of the market batch failed", async () => {
    const evidence = [failedEvidence()[0]!, availableEvidence()[1]!];
    const { gateway, generate } = successfulGateway();

    const { result } = await execute({
      gateway,
      evidence,
      failures: [{ lineId: "line-etf-300", status: "failed", errorCode: "provider_failed" }],
    });

    expect(generate).toHaveBeenCalledTimes(3);
    expect(result.analysis.status).toBe("limited");
    expect(result.review_packet?.coverage.uncovered_line_ids).toContain("line-etf-300");
  });

  it("persists and replays the packet, generated reports and generation versions without rerunning", async () => {
    const { gateway, generate } = successfulGateway();
    const { result } = await execute({
      gateway,
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

    expect(generate).toHaveBeenCalledTimes(3);
    expect(replay).toMatchObject({
      status: "replayed",
      source: "immutable_history",
      record: {
        review_packet: { schema_version: "review-packet.v2" },
        generated_review: { schema_version: GENERATED_DAILY_REVIEW_SCHEMA_VERSION },
        model_id: "step-explore",
        prompt_version: "daily-review-prompt.v3",
        atlas_policy_version: ATLAS_GENERATION_POLICY_VERSION,
      },
    });
  });
});
