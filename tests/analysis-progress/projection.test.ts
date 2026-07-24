import { describe, expect, it } from "vitest";
import {
  TASK_EVENT_STAGES,
  TASK_EVENT_STATES,
  type TaskEvent,
  type TaskEventStage,
  type TaskEventState,
} from "../../src/contracts/index.js";
import {
  projectAnalysisProgress,
  shouldAnimateAnalysisProgress,
  type AnalysisConnectionState,
} from "../../src/features/analysis-progress/projection.js";

function event(
  eventId: string,
  stage: TaskEventStage,
  state: TaskEventState,
  extra: Partial<TaskEvent> = {},
): TaskEvent {
  return {
    event_id: eventId,
    analysis_id: "analysis-31",
    occurred_at: `2026-07-25T08:00:0${eventId.at(-1) ?? "0"}.000Z`,
    stage,
    state,
    ...extra,
  };
}

describe("analysis progress projection", () => {
  it.each<AnalysisConnectionState>([
    "connecting",
    "connected",
    "disconnected",
    "reconnecting",
    "recovered",
  ])("keeps no-event waiting explicit for %s", (connection) => {
    const model = projectAnalysisProgress({ analysisId: "analysis-31", connection, events: [] });

    expect(model.latestEventId).toBeUndefined();
    expect(model.currentStage).toBeUndefined();
    expect(model.stages).toHaveLength(8);
    expect(model.stages.every((stage) => stage.state === "not_reported")).toBe(true);
    expect(model.currentMessage).not.toContain("完成");
    expect(model.isTerminal).toBe(false);
  });

  it("projects only real events, keeps raw details in text view, and deduplicates reconnect delivery", () => {
    const events = [
      event("event-1", "validate_snapshot", "running", { message: "校验并冻结确认快照。" }),
      event("event-2", "validate_snapshot", "succeeded"),
      event("event-3", "resolve_assets", "running"),
      event("event-4", "form_conclusions_and_advice", "retrying", {
        covered_count: 2,
        message: "理性分析输出未通过边界校验，执行有限重试。",
        retry_count: 1,
      }),
      event("event-4", "form_conclusions_and_advice", "retrying", { retry_count: 9 }),
      { ...event("other-1", "persist_or_return", "succeeded"), analysis_id: "other-analysis" },
    ];

    const model = projectAnalysisProgress({
      analysisId: "analysis-31",
      connection: "connected",
      events,
    });

    expect(model.phase).toBe("retrying");
    expect(model.currentMessage).toBe("结论校验有限重试");
    expect([...model.currentMessage].length).toBeLessThanOrEqual(20);
    expect(model.coveredCount).toBe(2);
    expect(model.stages.find((stage) => stage.stage === "validate_snapshot")?.state).toBe("succeeded");
    expect(model.stages.find((stage) => stage.stage === "resolve_assets")?.state).toBe("running");
    expect(model.stages.find((stage) => stage.stage === "form_conclusions_and_advice")).toMatchObject({
      detail: "理性分析输出未通过边界校验，执行有限重试。",
      isCurrent: true,
      retryCount: 1,
      state: "retrying",
    });
    expect(model.stages.find((stage) => stage.stage === "persist_or_return")?.state).toBe("not_reported");
  });

  it("keeps every event-driven current bubble within the 20-character boundary", () => {
    for (const stage of TASK_EVENT_STAGES) {
      for (const state of TASK_EVENT_STATES) {
        const model = projectAnalysisProgress({
          analysisId: "analysis-31",
          connection: "connected",
          events: [event(`${stage}:${state}`, stage, state)],
        });

        expect([...model.currentMessage].length, `${stage}:${state}`).toBeLessThanOrEqual(20);
      }
    }
  });

  it("restores the same task projection without replaying or inventing stages", () => {
    const events = [
      event("event-1", "validate_snapshot", "succeeded"),
      event("event-2", "resolve_assets", "running"),
    ];
    const beforeLeave = projectAnalysisProgress({
      analysisId: "analysis-31",
      connection: "connected",
      events,
    });
    const afterReturn = projectAnalysisProgress({
      analysisId: "analysis-31",
      connection: "connected",
      events: [...events, events[0]!],
    });

    expect(afterReturn).toEqual(beforeLeave);
    expect(afterReturn.latestEventId).toBe("event-2");
    expect(afterReturn.stages.filter((stage) => stage.state !== "not_reported")).toHaveLength(2);
  });

  it("preserves received stages through disconnect and exposes explicit recovery state", () => {
    const events = [event("event-1", "fetch_structured_data", "running")];
    const disconnected = projectAnalysisProgress({
      analysisId: "analysis-31",
      connection: "disconnected",
      events,
    });
    const recovered = projectAnalysisProgress({
      analysisId: "analysis-31",
      connection: "recovered",
      events,
    });

    expect(disconnected.phase).toBe("interrupted");
    expect(disconnected.currentMessage).toBe("连接中断，状态已保留");
    expect(disconnected.stages.find((stage) => stage.isCurrent)?.state).toBe("running");
    expect(recovered.phase).toBe("waiting");
    expect(recovered.currentMessage).toBe("连接已恢复，继续接收");
    expect(recovered.stages).toEqual(disconnected.stages);
  });

  it("requires an explicit same-analysis terminal result instead of inferring completion", () => {
    const events = [event("event-1", "persist_or_return", "succeeded")];
    const awaitingResult = projectAnalysisProgress({
      analysisId: "analysis-31",
      connection: "connected",
      events,
    });
    const wrongResult = projectAnalysisProgress({
      analysisId: "analysis-31",
      connection: "connected",
      events,
      terminal: {
        analysis_id: "another-analysis",
        displayable: true,
        status: "supported",
        terminal_reason: "completed",
      },
    });
    const limitedDeadline = projectAnalysisProgress({
      analysisId: "analysis-31",
      connection: "connected",
      events,
      terminal: {
        analysis_id: "analysis-31",
        displayable: true,
        reason: "分析达到硬截止，已停止未完成任务。",
        status: "limited",
        terminal_reason: "deadline",
      },
    });
    const unavailable = projectAnalysisProgress({
      analysisId: "analysis-31",
      connection: "connected",
      events,
      terminal: {
        analysis_id: "analysis-31",
        displayable: false,
        status: "unavailable",
        terminal_reason: "model_failure",
      },
    });

    expect(awaitingResult.isTerminal).toBe(false);
    expect(wrongResult.isTerminal).toBe(false);
    expect(limitedDeadline).toMatchObject({
      canOpenResult: true,
      canRetry: true,
      currentMessage: "复盘完成，结论受限",
      isTerminal: true,
      phase: "terminal",
    });
    expect(unavailable).toMatchObject({ canOpenResult: false, canRetry: true, isTerminal: true });
  });

  it("does not infer result displayability from a successful status", () => {
    const model = projectAnalysisProgress({
      analysisId: "analysis-31",
      connection: "connected",
      events: [],
      terminal: {
        analysis_id: "analysis-31",
        displayable: false,
        status: "supported",
        terminal_reason: "completed",
      },
    });

    expect(model).toMatchObject({
      canOpenResult: false,
      currentMessage: "复盘完成，可查看结果",
      isTerminal: true,
    });
  });

  it("stops animation for reduced motion, background, offscreen, disconnect, and terminal states", () => {
    const base = {
      connection: "connected" as const,
      inViewport: true,
      isTerminal: false,
      pageVisible: true,
      phase: "active" as const,
      reduceMotion: false,
    };

    expect(shouldAnimateAnalysisProgress(base)).toBe(true);
    expect(shouldAnimateAnalysisProgress({ ...base, reduceMotion: true })).toBe(false);
    expect(shouldAnimateAnalysisProgress({ ...base, pageVisible: false })).toBe(false);
    expect(shouldAnimateAnalysisProgress({ ...base, inViewport: false })).toBe(false);
    expect(shouldAnimateAnalysisProgress({ ...base, connection: "disconnected" })).toBe(false);
    expect(shouldAnimateAnalysisProgress({ ...base, phase: "interrupted" })).toBe(false);
    expect(shouldAnimateAnalysisProgress({ ...base, isTerminal: true })).toBe(false);
  });
});
