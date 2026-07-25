import { describe, expect, it } from "vitest";
import {
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  THEME_NARRATIVE_SCHEMA_VERSION,
  type AnalysisCommitFence,
  type ThemeModelOutput,
} from "../../src/analysis/index.js";
import {
  CONTRACTS_VERSION,
  type AnalysisResult,
  type PortfolioSnapshot,
} from "../../src/contracts/index.js";
import {
  HISTORY_SCHEMA_VERSION,
  HistorySaveError,
  HistoryService,
  HistoryWorkspaceLifecycle,
  MemoryHistoryStore,
  type HistoryStore,
  type StoredHistoryEnvelope,
} from "../../src/history/index.js";
import {
  FakeClock,
  MemoryWorkspaceStore,
  WORKSPACE_TTL_MS,
  WorkspaceService,
} from "../../src/workspace/index.js";

const STARTED_AT = "2026-07-25T01:00:00.000Z";
const COMPLETED_AT = "2026-07-25T01:00:30.000Z";
const CUTOFF_AT = "2026-07-25T00:00:00.000Z";
const TRADING_DAY = "2026-07-24";

function snapshot(suffix = "a"): PortfolioSnapshot {
  return {
    snapshot_id: `snapshot-${suffix}`,
    created_at: "2026-07-24T23:00:00.000Z",
    contracts_version: CONTRACTS_VERSION,
    theme_id: "eastern_observation",
    lines: [{
      line_id: `line-${suffix}`,
      asset_class: "etf",
      name: `虚构宽基 ETF ${suffix}`,
      symbol: "510300.SH",
      market: "SH",
      size_basis: "示例持仓规模：中等",
      observation_date: TRADING_DAY,
      entry_method: "example",
      confirmed_at: "2026-07-24T23:00:00.000Z",
    }],
    constraints: {
      investment_horizon: "长期",
      near_term_liquidity: "低",
      tolerable_drawdown: "中等",
      investment_objective: "长期增长",
    },
  };
}

function analysis(snap: PortfolioSnapshot, suffix = "a", completedAt = COMPLETED_AT): AnalysisResult {
  const lineId = snap.lines[0]!.line_id;
  const evidenceId = `evidence-${suffix}`;
  const derivedId = `derived-${suffix}`;
  return {
    contracts_version: CONTRACTS_VERSION,
    analysis_id: `analysis-${suffix}`,
    snapshot_id: snap.snapshot_id,
    status: "supported",
    analysis_started_at: STARTED_AT,
    analysis_completed_at: completedAt,
    latest_complete_trading_day: TRADING_DAY,
    evidence_cutoff_at: CUTOFF_AT,
    theme_id: snap.theme_id,
    coverage: {
      covered_line_ids: [lineId],
      uncovered_line_ids: [],
      unsupported_line_ids: [],
      missing_metrics: [],
    },
    constraints: structuredClone(snap.constraints),
    conclusions: [{
      id: `conclusion-${suffix}`,
      statement: "已核对的结构化观察支持继续关注组合变化。",
      provenance: "generated",
      refs: [{ ref_id: evidenceId, kind: "evidence" }],
      affected_by_unknowns: false,
    }],
    advice: [{
      id: `advice-${suffix}`,
      kind: "maintain_observation",
      statement: "维持观察，等待下一完整交易日证据更新。",
      trigger_refs: [{ ref_id: derivedId, kind: "derived" }],
      urgency: "routine",
    }],
    evidence: [{
      id: evidenceId,
      scope: { kind: "asset", line_id: lineId, symbol: "510300.SH" },
      metric_or_event_type: "close",
      value: "示例收盘观察",
      unit: "CNY",
      source: { name: "fixture-structured", locator: `fixture://${suffix}/close` },
      observation_or_event_time: TRADING_DAY,
      fetched_at: "2026-07-24T23:30:00.000Z",
      status: "available",
      limitations: [],
      provenance: "observed",
    }],
    derived: [{
      id: derivedId,
      label: "定性暴露",
      value: "中等",
      input_refs: [lineId],
      evidence_refs: [evidenceId],
      formula_or_rule: "confirmed line plus available observation",
      provenance: "derived",
    }],
    unknowns: [],
    assumptions: [],
    limitations: [],
    risk_notes: [{
      id: `risk-${suffix}`,
      statement: "满懂只提供方向性建议，不构成投资建议或收益保证。",
      is_boundary_notice: true,
    }],
  };
}

function narrative(result: AnalysisResult): ThemeModelOutput {
  return {
    schema_version: THEME_NARRATIVE_SCHEMA_VERSION,
    rational_analysis_id: result.analysis_id,
    theme_id: result.theme_id,
    headline: "今日观象",
    body_paragraphs: result.conclusions.map((item) => item.statement),
    mascot_mood: "calm",
    guidance_summary: result.advice.map((item) => item.statement).join("；"),
    conclusion_ids: result.conclusions.map((item) => item.id),
    advice_ids: result.advice.map((item) => item.id),
  };
}

function openFence(): AnalysisCommitFence {
  const controller = new AbortController();
  return { signal: controller.signal, canCommit: () => true };
}

async function save(
  history: HistoryService,
  workspaceId: string,
  snap: PortfolioSnapshot,
  result: AnalysisResult,
  fence = openFence(),
): Promise<void> {
  await history.createResultSink(workspaceId, snap).save({
    analysis: result,
    rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
    narrative: narrative(result),
    experience_source: "edited",
  }, fence);
}

describe("immutable analysis history", () => {
  it("appends complete records, isolates workspaces, and never rewrites old bytes", async () => {
    const store = new MemoryHistoryStore();
    const history = new HistoryService(store);
    const firstSnapshot = snapshot("a");
    const firstAnalysis = analysis(firstSnapshot, "a");
    await save(history, "workspace-a", firstSnapshot, firstAnalysis);
    const committedBytes = store.getBytesForTests("workspace-a", "analysis-a");

    firstSnapshot.lines[0]!.name = "later local mutation";
    firstAnalysis.conclusions[0]!.statement = "later local mutation";
    const secondSnapshot = snapshot("b");
    await save(history, "workspace-a", secondSnapshot, analysis(secondSnapshot, "b", "2026-07-25T01:01:00.000Z"));

    expect(store.getBytesForTests("workspace-a", "analysis-a")).toBe(committedBytes);
    const detail = await history.getDetail("workspace-a", "analysis-a");
    expect(detail.status).toBe("found");
    if (detail.status === "found") {
      expect(detail.record.snapshot.lines[0]!.name).toBe("虚构宽基 ETF a");
      expect(detail.record.analysis.conclusions[0]!.statement).toBe("已核对的结构化观察支持继续关注组合变化。");
      expect(Object.isFrozen(detail.record)).toBe(true);
      expect(detail.record.experience_source).toBe("edited");
    }
    expect(await history.getDetail("workspace-b", "analysis-a")).toEqual({ status: "not_found", code: "not_found" });
    expect((await history.list("workspace-a")).map((item) => item.analysis_id)).toEqual(["analysis-b", "analysis-a"]);
    expect(await history.list("workspace-b")).toEqual([]);
  });

  it("replays committed input, evidence, and rational output without any provider dependency", async () => {
    const history = new HistoryService();
    const snap = snapshot("replay");
    const result = analysis(snap, "replay");
    await save(history, "workspace-replay", snap, result);

    result.evidence[0]!.value = "later provider value";
    const replay = await history.replay("workspace-replay", "analysis-replay");
    expect(replay.status).toBe("replayed");
    if (replay.status === "replayed") {
      expect(replay.source).toBe("immutable_history");
      expect(replay.record.analysis.evidence[0]!.value).toBe("示例收盘观察");
      expect(replay.record.snapshot.snapshot_id).toBe("snapshot-replay");
    }
  });

  it("returns typed unsupported-version states and never attempts a current decode", async () => {
    const store = new MemoryHistoryStore();
    const history = new HistoryService(store);
    const legacy: StoredHistoryEnvelope = {
      workspace_id: "workspace-a",
      record_id: "legacy-analysis",
      analysis_id: "legacy-analysis",
      snapshot_id: "legacy-snapshot",
      analysis_completed_at: COMPLETED_AT,
      evidence_cutoff_at: CUTOFF_AT,
      result_status: "limited",
      theme_id: "eastern_observation",
      versions: {
        history_schema: "analysis-history.v0",
        contracts: "0.9.0",
        rational_analysis: "rational-analysis.v0",
        theme_narrative: "theme-narrative.v0",
      },
      payload_json: "not even current JSON",
    };
    await store.append(legacy, openFence());

    const listed = await history.list("workspace-a");
    expect(listed[0]).toMatchObject({ record_id: "legacy-analysis", readability: "unsupported_version" });
    const detail = await history.getDetail("workspace-a", "legacy-analysis");
    expect(detail.status).toBe("unsupported_version");
    if (detail.status === "unsupported_version") {
      expect(detail.unsupported_versions.map((item) => item.component)).toEqual([
        "history_schema",
        "contracts",
        "rational_analysis",
        "theme_narrative",
      ]);
    }
    expect((await history.replay("workspace-a", "legacy-analysis")).status).toBe("unsupported_version");
  });

  it("keeps legacy V1 records readable without inventing an experience source", async () => {
    const store = new MemoryHistoryStore();
    const history = new HistoryService(store);
    const snap = snapshot("legacy-v1");
    const result = analysis(snap, "legacy-v1");
    await save(history, "workspace-legacy-v1", snap, result);
    const bytes = store.getBytesForTests("workspace-legacy-v1", result.analysis_id);
    if (!bytes) throw new Error("missing saved history");
    const envelope = JSON.parse(bytes) as StoredHistoryEnvelope;
    const payload = JSON.parse(envelope.payload_json) as Record<string, unknown>;
    delete payload.experience_source;
    envelope.payload_json = JSON.stringify(payload);

    const legacyStore = new MemoryHistoryStore();
    await legacyStore.append(envelope, openFence());
    const detail = await new HistoryService(legacyStore).getDetail(
      "workspace-legacy-v1",
      result.analysis_id,
    );
    expect(detail.status).toBe("found");
    if (detail.status === "found") expect(detail.record.experience_source).toBeUndefined();
  });

  it("fences late commits and maps storage failures to privacy-safe errors without partial records", async () => {
    const store = new MemoryHistoryStore();
    const history = new HistoryService(store);
    const snap = snapshot("fenced");
    const result = analysis(snap, "fenced");
    const controller = new AbortController();
    controller.abort();

    await expect(save(history, "workspace-a", snap, result, {
      signal: controller.signal,
      canCommit: () => false,
    })).rejects.toMatchObject({ code: "commit_fenced" });
    expect(await history.list("workspace-a")).toEqual([]);

    const leakingStore: HistoryStore = {
      append: async () => { throw new Error(JSON.stringify(snap)); },
      get: async () => null,
      list: async () => [],
      eraseWorkspace: async () => 0,
    };
    let caught: unknown;
    try {
      await save(new HistoryService(leakingStore), "workspace-a", snap, result);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HistorySaveError);
    expect(caught).toMatchObject({ code: "storage_failure" });
    expect(String(caught)).not.toContain("510300.SH");
    expect(String(caught)).not.toContain("虚构宽基");
  });

  it("serializes concurrent appends, deduplicates retries, rejects conflicts, and sorts ties deterministically", async () => {
    const store = new MemoryHistoryStore();
    const history = new HistoryService(store);
    const snapA = snapshot("a");
    const snapB = snapshot("b");
    const resultA = analysis(snapA, "a");
    const resultB = analysis(snapB, "b");

    await Promise.all([
      save(history, "workspace-a", snapB, resultB),
      save(history, "workspace-a", snapA, resultA),
      save(history, "workspace-a", structuredClone(snapA), structuredClone(resultA)),
    ]);
    expect((await history.list("workspace-a")).map((item) => item.analysis_id)).toEqual(["analysis-a", "analysis-b"]);

    const conflicting = structuredClone(resultA);
    conflicting.analysis_completed_at = "2026-07-25T01:00:31.000Z";
    await expect(save(history, "workspace-a", snapA, conflicting)).rejects.toMatchObject({ code: "record_conflict" });
    const replay = await history.replay("workspace-a", "analysis-a");
    expect(replay.status === "replayed" && replay.record.analysis.analysis_completed_at).toBe(COMPLETED_AT);
  });

  it("makes concurrent workspace erasure win over a stale commit without leaving an orphan", async () => {
    const history = new HistoryService();
    const snap = snapshot("erase-race");
    const result = analysis(snap, "erase-race");
    const sink = history.createResultSink("workspace-race", snap);

    const [, append] = await Promise.allSettled([
      history.eraseWorkspace("workspace-race"),
      sink.save({
        analysis: result,
        rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
        narrative: narrative(result),
      }, openFence()),
    ]);
    expect(append).toMatchObject({ status: "rejected", reason: { code: "workspace_deleted" } });
    expect(await history.list("workspace-race")).toEqual([]);
  });
});

describe("workspace history lifecycle", () => {
  it("cascades active deletion, leaves a write tombstone, and hides erased history", async () => {
    const workspaces = new WorkspaceService(new MemoryWorkspaceStore());
    const created = await workspaces.create();
    const history = new HistoryService();
    const lifecycle = new HistoryWorkspaceLifecycle(workspaces, history);
    const snap = snapshot("delete");
    const result = analysis(snap, "delete");
    const staleSink = history.createResultSink(created.record.workspace_id, snap);
    await staleSink.save({
      analysis: result,
      rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
      narrative: narrative(result),
    }, openFence());

    const deletion = await lifecycle.delete(created.record.locator);
    expect(deletion).toMatchObject({ ok: true, history_deleted_count: 1 });
    expect(await history.getDetail(created.record.workspace_id, result.analysis_id)).toEqual({ status: "not_found", code: "not_found" });
    await expect(staleSink.save({
      analysis: result,
      rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
      narrative: narrative(result),
    }, openFence())).rejects.toMatchObject({ code: "workspace_deleted" });
  });

  it("cascades TTL cleanup for every purged workspace", async () => {
    const clock = new FakeClock(new Date("2026-07-01T00:00:00.000Z"));
    const workspaces = new WorkspaceService(new MemoryWorkspaceStore(), clock);
    const created = await workspaces.create();
    const history = new HistoryService();
    const lifecycle = new HistoryWorkspaceLifecycle(workspaces, history);
    const snap = snapshot("ttl");
    const result = analysis(snap, "ttl");
    await save(history, created.record.workspace_id, snap, result);

    clock.advanceMs(WORKSPACE_TTL_MS + 1);
    const cleanup = await lifecycle.purgeExpired();
    expect(cleanup.purged).toEqual([created.record.workspace_id]);
    expect(cleanup.history_deleted).toEqual([created.record.workspace_id]);
    expect(cleanup.history_failed).toEqual([]);
    expect(await history.replay(created.record.workspace_id, result.analysis_id)).toEqual({ status: "not_found", code: "not_found" });
  });
});

describe("persisted record shape", () => {
  it("indexes snapshot, cutoff, result, and all schema/theme versions", async () => {
    const history = new HistoryService();
    const snap = snapshot("versions");
    const result = analysis(snap, "versions");
    await save(history, "workspace-a", snap, result);

    expect(await history.list("workspace-a")).toEqual([expect.objectContaining({
      snapshot_id: "snapshot-versions",
      evidence_cutoff_at: CUTOFF_AT,
      result_status: "supported",
      narrative_status: "available",
      readability: "readable",
      versions: {
        history_schema: HISTORY_SCHEMA_VERSION,
        contracts: CONTRACTS_VERSION,
        rational_analysis: RATIONAL_ANALYSIS_SCHEMA_VERSION,
        theme_narrative: THEME_NARRATIVE_SCHEMA_VERSION,
      },
    })]);
  });

  it("indexes a validated result that has no generated theme narrative", async () => {
    const history = new HistoryService();
    const snap = snapshot("no-theme");
    const result = analysis(snap, "no-theme");
    await history.createResultSink("workspace-a", snap).save({
      analysis: result,
      rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
    }, openFence());

    expect(await history.list("workspace-a")).toEqual([expect.objectContaining({
      narrative_status: "not_generated",
      versions: expect.objectContaining({ theme_narrative: null }),
    })]);
    const replay = await history.replay("workspace-a", result.analysis_id);
    expect(replay.status === "replayed" && replay.record.narrative).toBeUndefined();
  });
});
