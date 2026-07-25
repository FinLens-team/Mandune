import { describe, expect, it } from "vitest";
import {
  JourneyController,
  createJourneyPersistence,
  identityToPortfolioDraft,
  initialJourneyState,
  journeyReducer,
  type AnalysisResultResponse,
  type AnalysisStatusResponse,
  type JourneyGateway,
  type JourneyPersistence,
  type JourneyState,
} from "../../src/app/client/index.js";
import type {
  AnalysisResultStatus,
  PortfolioDraft,
  TaskEvent,
} from "../../src/contracts/index.js";
import { createDemoExperienceFromSeed } from "../../src/demo-experience/index.js";
import { getFixture, type FixtureScenarioId } from "../../src/fixtures/index.js";
import {
  HISTORY_SCHEMA_VERSION,
  type HistoryReadResult,
  type HistoryRecordV1,
  type HistoryReplayResult,
  type HistorySummary,
} from "../../src/history/index.js";
import type { WorkspacePublicStatus } from "../../src/workspace/index.js";

const workspace: WorkspacePublicStatus = {
  workspace_id: "workspace_controller",
  last_active_at: "2026-07-25T08:00:00.000Z",
  expires_at: "2026-08-24T08:00:00.000Z",
  ttl_days: 30,
};

function runtimeRecord(scenarioId: FixtureScenarioId, analysisId: string): HistoryRecordV1 {
  const fixture = getFixture(scenarioId);
  const analysis = structuredClone(fixture.analysis);
  analysis.analysis_id = analysisId;
  if (analysis.status === "observation_only" && analysis.advice.length === 0) {
    const lineId = analysis.coverage.covered_line_ids[0] ?? fixture.snapshot.lines[0]?.line_id;
    if (!lineId) throw new Error("observation_fixture_has_no_confirmed_line");
    analysis.advice = [{
      id: "advice-observation-wait",
      kind: "wait_for_data_confirmation",
      statement: "等待补充信息后再确认方向。",
      trigger_refs: [{ ref_id: lineId, kind: "confirmed_input" }],
      urgency: "routine",
    }];
  }
  const narrative = analysis.status === "unavailable" ? undefined : {
    schema_version: "theme-narrative.v1" as const,
    rational_analysis_id: analysisId,
    theme_id: analysis.theme_id,
    headline: "今日观象",
    body_paragraphs: analysis.conclusions.map((item) => item.statement),
    mascot_mood: "calm",
    guidance_summary: analysis.advice.map((item) => item.statement).join("；"),
    conclusion_ids: analysis.conclusions.map((item) => item.id),
    advice_ids: analysis.advice.map((item) => item.id),
  };
  return {
    schema_version: HISTORY_SCHEMA_VERSION,
    record_id: analysisId,
    snapshot: structuredClone(fixture.snapshot),
    analysis,
    rational_analysis_version: "rational-analysis.v1",
    theme_narrative_version: narrative?.schema_version ?? null,
    ...(narrative ? { narrative } : {}),
  };
}

function draftFor(scenarioId: FixtureScenarioId): PortfolioDraft {
  const fixture = getFixture(scenarioId);
  return {
    draft_id: `draft-${scenarioId}`,
    created_at: "2026-07-25T07:00:00.000Z",
    updated_at: "2026-07-25T07:00:00.000Z",
    source_label: "随机体验身份 · 测试 fixture · 非实时行情",
    constraints: structuredClone(fixture.snapshot.constraints),
    lines: fixture.snapshot.lines.map((line) => ({
      line_id: line.line_id,
      asset_class: line.asset_class,
      name: line.name,
      symbol: line.symbol,
      ...(line.market ? { market: line.market } : {}),
      size_basis: line.size_basis,
      observation_date: line.observation_date,
      entry_method: "example",
      is_usable: true,
      unresolved_fields: [],
      notes: "虚构测试持仓",
    })),
  };
}

class FakeGateway implements JourneyGateway {
  readonly pollIntervalMs = 5;
  readonly calls: string[] = [];
  deleted = false;
  draft: PortfolioDraft | null;
  record: HistoryRecordV1;
  status: AnalysisStatusResponse;
  result: AnalysisResultResponse;
  replayOverride?: HistoryReplayResult;

  constructor(
    scenarioId: FixtureScenarioId = "supported_full",
    options: { running?: boolean; withoutNarrative?: boolean; restartInterrupted?: boolean } = {},
  ) {
    const analysisId = `analysis_${scenarioId}`;
    this.draft = draftFor(scenarioId);
    this.record = runtimeRecord(scenarioId, analysisId);
    if (options.withoutNarrative) {
      this.record = { ...this.record, narrative: undefined, theme_narrative_version: null };
    }
    this.status = {
      analysis_id: analysisId,
      state: options.running ? "running" : "terminal",
      created_at: "2026-07-25T08:00:00.000Z",
      updated_at: "2026-07-25T08:00:05.000Z",
      ...(options.running ? {} : {
        result_status: this.record.analysis.status,
        retryable: this.record.analysis.status === "unavailable",
        terminal_reason: options.restartInterrupted ? "restart_interrupted" : "completed",
      }),
    };
    this.result = options.restartInterrupted
      ? {
          status: "unavailable",
          analysis_id: analysisId,
          reason: "restart_interrupted",
          retryable: true,
        }
      : {
          status: "ready",
          analysis_id: analysisId,
          source: { kind: "fixture", is_live: false, label: "示例 fixture（非实时）" },
          analysis: this.record.analysis,
          ...(this.record.narrative ? { narrative: this.record.narrative } : {}),
        };
  }

  async ensureWorkspace() {
    this.calls.push("ensureWorkspace");
    return workspace;
  }

  async touchWorkspace() {
    this.calls.push("touchWorkspace");
    return workspace;
  }

  async getCurrentDraft() {
    this.calls.push("getCurrentDraft");
    return this.draft ? structuredClone(this.draft) : null;
  }

  async saveCurrentDraft(draft: PortfolioDraft) {
    this.calls.push("saveCurrentDraft");
    this.draft = structuredClone(draft);
    return structuredClone(draft);
  }

  async startAnalysis() {
    this.calls.push("startAnalysis");
    return { analysis_id: this.status.analysis_id, reused_active: false };
  }

  async getAnalysisStatus(analysisId: string) {
    this.calls.push(`getAnalysisStatus:${analysisId}`);
    return this.status;
  }

  async getAnalysisEvents(analysisId: string): Promise<TaskEvent[]> {
    this.calls.push(`getAnalysisEvents:${analysisId}`);
    return [{
      event_id: `${analysisId}:event:1`,
      analysis_id: analysisId,
      stage: "validate_snapshot",
      state: this.status.state === "terminal" ? "succeeded" : "running",
      occurred_at: "2026-07-25T08:00:01.000Z",
    }];
  }

  async getAnalysisResult(analysisId: string) {
    this.calls.push(`getAnalysisResult:${analysisId}`);
    return this.result;
  }

  async list(workspaceId: string): Promise<HistorySummary[]> {
    void workspaceId;
    this.calls.push("listHistory");
    return [];
  }

  async getDetail(workspaceId: string, recordId: string): Promise<HistoryReadResult> {
    void workspaceId;
    void recordId;
    this.calls.push("getHistoryDetail");
    return { status: "found", record: this.record };
  }

  async replayHistory(recordId: string): Promise<HistoryReplayResult> {
    this.calls.push(`replayHistory:${recordId}`);
    return this.replayOverride ?? {
      status: "replayed",
      source: "immutable_history",
      record: this.record,
    };
  }

  async deleteWorkspace(): Promise<void> {
    this.calls.push("deleteWorkspace");
    this.deleted = true;
  }
}

function harness(gateway: FakeGateway, persistence?: JourneyPersistence) {
  let state: JourneyState = initialJourneyState;
  const stored = new Map<string, string>();
  const local = persistence ?? createJourneyPersistence({
    getItem: (key) => stored.get(key) ?? null,
    removeItem: (key) => { stored.delete(key); },
    setItem: (key, value) => { stored.set(key, value); },
  });
  const controller = new JourneyController({
    dispatch: (action) => { state = journeyReducer(state, action); },
    gateway,
    getState: () => state,
    persistence: local,
    prefersReducedMotion: () => true,
  });
  return { controller, gateway, get state() { return state; }, persistence: local, stored };
}

async function enterReturning(app: ReturnType<typeof harness>): Promise<void> {
  await app.controller.bootstrap();
  expect(app.state.phase).toBe("onboarding");
  await app.controller.enterApp({ identity: null, returning: true });
}

describe("journey controller first and returning entry", () => {
  it("hydrates a durable returning draft and restores reduced motion", async () => {
    const app = harness(new FakeGateway());
    app.persistence.setReducedMotion(workspace.workspace_id, false);

    await enterReturning(app);

    expect(app.state).toMatchObject({
      phase: "home",
      reducedMotion: false,
      draft: { source_label: "随机体验身份 · 测试 fixture · 非实时行情" },
    });
    expect(app.gateway.calls.slice(0, 3)).toEqual([
      "ensureWorkspace",
      "touchWorkspace",
      "getCurrentDraft",
    ]);
  });

  it("converts and saves the first-run identity before entering home", async () => {
    const gateway = new FakeGateway();
    gateway.draft = null;
    const app = harness(gateway);
    await app.controller.bootstrap();
    const identity = createDemoExperienceFromSeed(123);

    await app.controller.enterApp({ identity, returning: false });

    expect(app.state.phase).toBe("home");
    expect(app.state.draft).toEqual(identityToPortfolioDraft(identity));
    expect(gateway.calls).toContain("saveCurrentDraft");
  });

  it("does not invent a returning draft when durable hydration is empty", async () => {
    const gateway = new FakeGateway();
    gateway.draft = null;
    const app = harness(gateway);
    await app.controller.bootstrap();

    await app.controller.enterApp({ identity: null, returning: true });

    expect(app.state).toMatchObject({ phase: "workspace_error" });
    expect(app.state.message).toContain("没有可恢复的体验草稿");
    expect(gateway.calls).not.toContain("startAnalysis");
  });

  it("keeps the newest controlled draft visible while serialized older saves finish", async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
    class QueuedGateway extends FakeGateway {
      saveCount = 0;

      override async saveCurrentDraft(draft: PortfolioDraft) {
        const index = this.saveCount++;
        this.calls.push(`queuedSave:${index}`);
        await (index === 0 ? firstGate : secondGate);
        this.draft = structuredClone(draft);
        return structuredClone(draft);
      }
    }
    const gateway = new QueuedGateway();
    const app = harness(gateway);
    await enterReturning(app);
    const first = { ...app.state.draft!, source_label: "较旧草稿" };
    const second = { ...app.state.draft!, source_label: "最新草稿" };

    app.controller.updateDraft(first);
    app.controller.updateDraft(second);
    await Promise.resolve();
    expect(app.state.draft?.source_label).toBe("最新草稿");
    releaseFirst();
    await Promise.resolve();
    await Promise.resolve();
    expect(app.state.draft?.source_label).toBe("最新草稿");
    releaseSecond();
    await Promise.resolve();
    await Promise.resolve();
  });
});

describe("journey controller analysis status matrix", () => {
  it.each([
    ["supported_full", "supported", true],
    ["limited_partial", "limited", true],
    ["observation_only_gaps", "observation_only", true],
    ["unavailable_no_evidence", "unavailable", false],
  ] as const)("keeps %s as %s with displayable=%s", async (scenarioId, status, displayable) => {
    const app = harness(new FakeGateway(scenarioId));
    await enterReturning(app);
    await app.controller.startAnalysis(app.state.draft!);

    // Displayable terminals now open the long card directly; degraded ones stay honest.
    expect(app.state.phase).toBe(displayable ? "result" : "analysis");
    expect(app.state.activeAnalysis?.terminal).toMatchObject({
      analysis_id: `analysis_${scenarioId}`,
      displayable,
      status: status as AnalysisResultStatus,
    });
    expect(Boolean(app.state.activeAnalysis?.resultInput)).toBe(displayable);
    if (displayable) {
      expect(app.state.activeAnalysis?.resultInput?.exampleLabel).toBe("示例 fixture（非实时）");
      expect(app.state.displayedResult).toEqual(app.state.activeAnalysis?.resultInput);
      expect(app.state.resultReturn).toBe("home");
    } else {
      expect(app.state.displayedResult).toBeNull();
      app.controller.openCurrentResult();
      expect(app.state.phase).toBe("analysis");
    }
  });

  it("fails closed when a supported result has no validated narrative", async () => {
    const app = harness(new FakeGateway("supported_full", { withoutNarrative: true }));
    await enterReturning(app);
    await app.controller.startAnalysis(app.state.draft!);

    expect(app.state.activeAnalysis?.terminal).toMatchObject({
      status: "supported",
      displayable: false,
      terminal_reason: "model_failure",
    });
    expect(app.state.activeAnalysis?.resultInput).toBeUndefined();
  });

  it("maps restart_interrupted to explicit retryable unavailable recovery", async () => {
    const app = harness(new FakeGateway("supported_full", { restartInterrupted: true }));
    await enterReturning(app);
    await app.controller.startAnalysis(app.state.draft!);

    expect(app.state.activeAnalysis?.terminal).toMatchObject({
      status: "unavailable",
      displayable: false,
      terminal_reason: "persistence_failure",
      reason: "restart_interrupted",
    });
  });
});

describe("journey controller mascot startToday entry", () => {
  function todaySummary(gateway: FakeGateway): HistorySummary {
    return {
      record_id: gateway.record.record_id,
      analysis_id: gateway.record.analysis.analysis_id,
      snapshot_id: gateway.record.snapshot.snapshot_id,
      analysis_completed_at: new Date().toISOString(),
      evidence_cutoff_at: gateway.record.analysis.evidence_cutoff_at,
      result_status: gateway.record.analysis.status,
      theme_id: gateway.record.analysis.theme_id,
      narrative_status: "available",
      readability: "readable",
      versions: {
        history_schema: HISTORY_SCHEMA_VERSION,
        contracts: gateway.record.analysis.contracts_version,
        rational_analysis: gateway.record.rational_analysis_version,
        theme_narrative: gateway.record.theme_narrative_version,
      },
    };
  }

  it("starts today's analysis once when no readable record exists yet", async () => {
    const app = harness(new FakeGateway("supported_full"));
    await enterReturning(app);

    await app.controller.startToday(app.state.draft!);

    expect(app.gateway.calls).toContain("listHistory");
    expect(app.gateway.calls.filter((call) => call === "startAnalysis")).toHaveLength(1);
    expect(app.state).toMatchObject({ phase: "result", resultReturn: "home" });
  });

  it("replays today's readable record instead of starting another analysis", async () => {
    const gateway = new FakeGateway("supported_full");
    const summary = todaySummary(gateway);
    gateway.list = async () => {
      gateway.calls.push("listHistory");
      return [summary];
    };
    const app = harness(gateway);
    await enterReturning(app);

    await app.controller.startToday(app.state.draft!);

    expect(gateway.calls).toContain(`replayHistory:${gateway.record.record_id}`);
    expect(gateway.calls.filter((call) => call === "startAnalysis")).toHaveLength(0);
    expect(app.state).toMatchObject({
      phase: "result",
      resultReturn: "home",
      displayedResult: { isExample: true },
    });
  });

  it("ignores older-day records and starts a fresh analysis", async () => {
    const gateway = new FakeGateway("supported_full");
    const summary = { ...todaySummary(gateway), analysis_completed_at: "2020-01-01T08:00:00.000Z" };
    gateway.list = async () => {
      gateway.calls.push("listHistory");
      return [summary];
    };
    const app = harness(gateway);
    await enterReturning(app);

    await app.controller.startToday(app.state.draft!);

    expect(gateway.calls.filter((call) => call === "startAnalysis")).toHaveLength(1);
    expect(app.state.phase).toBe("result");
  });
});

describe("journey controller recovery, history, and deletion", () => {
  it("recovers the same stored task after refresh and never starts another task", async () => {
    const gateway = new FakeGateway("supported_full", { running: true });
    const app = harness(gateway);
    app.persistence.setActiveAnalysis(workspace.workspace_id, gateway.status.analysis_id);

    await enterReturning(app);
    expect(app.state).toMatchObject({
      phase: "analysis",
      activeAnalysis: { analysisId: gateway.status.analysis_id },
    });
    await app.controller.refreshAnalysis(gateway.status.analysis_id);
    expect(app.state.activeAnalysis).toMatchObject({ connection: "connected", events: [{ state: "running" }] });
    app.controller.leaveAnalysis();
    expect(app.state.phase).toBe("home");
    await app.controller.resumeAnalysis(gateway.status.analysis_id);
    expect(app.state.phase).toBe("analysis");
    expect(gateway.calls.filter((call) => call === "startAnalysis")).toHaveLength(0);
  });

  it("opens only immutable replayable history and rejects unknown versions", async () => {
    const gateway = new FakeGateway();
    const app = harness(gateway);
    await enterReturning(app);

    await app.controller.openHistoryRecord(gateway.record.record_id);
    expect(app.state).toMatchObject({
      phase: "result",
      resultReturn: "history",
      displayedResult: { isExample: true },
    });

    gateway.record.narrative!.body_paragraphs = ["保证收益"];
    await app.controller.openHistoryRecord(gateway.record.record_id);
    expect(app.state.phase).toBe("history");
    expect(app.state.displayedResult).not.toEqual(expect.objectContaining({
      narrative: expect.objectContaining({ body_paragraphs: ["保证收益"] }),
    }));

    gateway.replayOverride = {
      status: "unsupported_version",
      summary: {
        record_id: "analysis_old",
        analysis_id: "analysis_old",
        snapshot_id: "snapshot_old",
        analysis_completed_at: "2026-07-25T08:00:00.000Z",
        evidence_cutoff_at: "2026-07-25T07:00:00.000Z",
        result_status: "limited",
        theme_id: "eastern_observation",
        narrative_status: "available",
        readability: "unsupported_version",
        versions: {
          history_schema: "analysis-history.v0",
          contracts: "0.9.0",
          rational_analysis: "rational-analysis.v0",
          theme_narrative: "theme-narrative.v0",
        },
      },
      unsupported_versions: [{ component: "history_schema", version: "analysis-history.v0" }],
    };
    await app.controller.openHistoryRecord("analysis_old");
    expect(app.state.phase).toBe("history");
    expect(app.state.message).toContain("未使用当前数据重新生成");
  });

  it("deletes the current workspace and clears scoped recovery state", async () => {
    const gateway = new FakeGateway();
    const app = harness(gateway);
    await enterReturning(app);
    app.persistence.setActiveAnalysis(workspace.workspace_id, gateway.status.analysis_id);
    app.persistence.setReducedMotion(workspace.workspace_id, true);

    await app.controller.deleteWorkspace();

    expect(gateway.deleted).toBe(true);
    expect(app.state).toMatchObject({ phase: "deleted", workspace: null, draft: null });
    expect(app.persistence.getActiveAnalysis(workspace.workspace_id)).toBeNull();
    expect(app.persistence.getReducedMotion(workspace.workspace_id)).toBeNull();
  });
});
