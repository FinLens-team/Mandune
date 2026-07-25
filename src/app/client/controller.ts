import type { DemoExperienceIdentity } from "../../demo-experience/index.js";
import {
  journeyLongCardIsDisplayable,
  type JourneyLongCardRuntimeInput,
} from "./runtime.js";
import type {
  AnalysisProgressTerminal,
  AnalysisProgressTerminalReason,
} from "../../features/analysis-progress/projection.js";
import type { HistoryRecordV1 } from "../../history/index.js";
import type { PortfolioDraft } from "../../contracts/index.js";
import { identityToPortfolioDraft } from "./identity.js";
import type {
  AnalysisResultResponse,
  AnalysisStatusResponse,
  JourneyGateway,
} from "./gateway.js";
import { JourneyGatewayError } from "./gateway.js";
import type { JourneyPersistence } from "./persistence.js";
import type { JourneyAction, JourneyPhase, JourneyState } from "./state.js";

export interface JourneyControllerOptions {
  dispatch: (action: JourneyAction) => void;
  gateway: JourneyGateway;
  getState: () => JourneyState;
  persistence: JourneyPersistence;
  prefersReducedMotion?: () => boolean;
}

export interface JourneyOnboardingExit {
  identity: DemoExperienceIdentity | null;
  returning: boolean;
}

function workspaceFailureMessage(error: unknown): string {
  if (error instanceof JourneyGatewayError && error.code === "unavailable") {
    return "私密工作区服务暂不可用，没有创建新的工作区。请稍后重试。";
  }
  if (error instanceof JourneyGatewayError && error.code === "network") {
    return "无法连接私密工作区服务，没有创建新的工作区。请检查网络后重试。";
  }
  return "无法读取私密工作区。为避免混淆或覆盖数据，当前没有进入体验流程。";
}

function analysisFailureMessage(error: unknown): string {
  if (error instanceof JourneyGatewayError && error.code === "network") {
    return "分析连接中断，已收到的真实阶段仍保留。";
  }
  return "分析状态暂时无法读取，返回后会继续核对同一任务。";
}

function terminalReason(value: string | undefined): AnalysisProgressTerminalReason {
  if (value === "completed") return "completed";
  if (value === "deadline") return "deadline";
  if (value === "cancelled") return "cancelled";
  if (value === "invalid_input") return "invalid_input";
  if (
    value === "restart_interrupted" ||
    value === "execution_failed" ||
    value === "persistence_failure"
  ) {
    return "persistence_failure";
  }
  return "model_failure";
}

function historyExampleLabel(record: HistoryRecordV1): string | undefined {
  if (!record.snapshot.lines.some((line) => line.entry_method === "example")) return undefined;
  const sources = record.analysis.evidence.flatMap((item) => [item.source.name, item.source.locator]);
  if (sources.some((value) => /cache|缓存/i.test(value))) {
    return "随机体验身份 · 缓存证据（非实时）";
  }
  if (sources.some((value) => /fixture|示例证据/i.test(value))) {
    return "随机体验身份 · fixture 证据（非实时）";
  }
  return "随机体验身份 · 已保存证据（不重新获取）";
}

function historyInput(
  record: HistoryRecordV1,
  exampleLabel?: string,
): JourneyLongCardRuntimeInput {
  return {
    analysis: record.analysis,
    ...(exampleLabel ? { exampleLabel } : {}),
    isExample: record.snapshot.lines.some((line) => line.entry_method === "example"),
    ...(record.narrative ? { narrative: record.narrative } : {}),
    ...(record.ai_text ? { aiText: record.ai_text } : {}),
    ...(record.ai_theme_text ? { aiThemeText: record.ai_theme_text } : {}),
    snapshot: record.snapshot,
  };
}

function isSameLocalDay(iso: string, now: Date): boolean {
  const value = new Date(iso);
  return value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate();
}

function terminalUnavailable(
  analysisId: string,
  reason: string,
  terminalReasonValue: AnalysisProgressTerminalReason,
): AnalysisProgressTerminal {
  return {
    analysis_id: analysisId,
    displayable: false,
    reason,
    status: "unavailable",
    terminal_reason: terminalReasonValue,
  };
}

export class JourneyController {
  private draftRevision = 0;
  private draftWrites: Promise<void> = Promise.resolve();
  private readonly refreshes = new Set<string>();

  constructor(private readonly options: JourneyControllerOptions) {}

  async bootstrap(): Promise<void> {
    this.options.dispatch({ type: "BOOT_STARTED" });
    try {
      let workspace = await this.options.gateway.ensureWorkspace();
      try {
        workspace = await this.options.gateway.touchWorkspace();
      } catch {
        // GET/create already authorized the workspace; activity refresh is best effort at boot.
      }
      const draft = await this.options.gateway.getCurrentDraft();
      const storedMotion = this.options.persistence.getReducedMotion(workspace.workspace_id);
      const reducedMotion = storedMotion ?? this.options.prefersReducedMotion?.() ?? false;
      this.options.dispatch({
        type: "BOOT_SUCCEEDED",
        workspace,
        draft,
        reducedMotion,
        resumeAnalysisId: this.options.persistence.getActiveAnalysis(workspace.workspace_id),
      });
    } catch (error) {
      this.options.dispatch({ type: "WORKSPACE_FAILED", message: workspaceFailureMessage(error) });
    }
  }

  async enterApp(exit: JourneyOnboardingExit): Promise<void> {
    const state = this.options.getState();
    if (!state.workspace) return;
    let draft = state.draft;
    if (exit.identity) {
      draft = identityToPortfolioDraft(exit.identity);
      const saved = await this.persistDraft(draft, ++this.draftRevision);
      if (!saved) return;
      draft = saved;
    }
    if (!draft) {
      this.options.dispatch({
        type: "WORKSPACE_FAILED",
        message: "当前工作区没有可恢复的体验草稿。请重新完成随机体验身份确认。",
      });
      return;
    }
    this.options.dispatch({
      type: "ENTER_APP",
      draft,
      resumeAnalysisId: state.resumeAnalysisId,
    });
  }

  resetOnboarding(): void {
    const workspaceId = this.options.getState().workspace?.workspace_id;
    if (!workspaceId) return;
    this.options.persistence.clearOnboarding(workspaceId);
    this.options.persistence.clearActiveAnalysis(workspaceId);
    this.options.dispatch({ type: "ONBOARDING_RESET" });
  }

  updateDraft(draft: PortfolioDraft): void {
    this.options.dispatch({ type: "DRAFT_CHANGED", draft });
    void this.persistDraft(draft, ++this.draftRevision);
  }

  private async persistDraft(
    draft: PortfolioDraft,
    revision: number,
  ): Promise<PortfolioDraft | null> {
    this.options.dispatch({ type: "DRAFT_SAVE_STARTED" });
    let saved: PortfolioDraft | null = null;
    const write = this.draftWrites
      .catch(() => undefined)
      .then(async () => {
        saved = await this.options.gateway.saveCurrentDraft(draft);
        if (revision === this.draftRevision) {
          this.options.dispatch({ type: "DRAFT_SAVE_SUCCEEDED", draft: saved });
        }
      })
      .catch(() => {
        if (revision === this.draftRevision) {
          this.options.dispatch({
            type: "DRAFT_SAVE_FAILED",
            message: "草稿尚未保存到私密工作区；保存成功前不会发起复盘。",
          });
        }
      });
    this.draftWrites = write;
    await write;
    return saved;
  }

  setReducedMotion(enabled: boolean): void {
    const workspaceId = this.options.getState().workspace?.workspace_id;
    if (workspaceId) this.options.persistence.setReducedMotion(workspaceId, enabled);
    this.options.dispatch({ type: "REDUCED_MOTION_CHANGED", enabled });
  }

  navigate(phase: Extract<JourneyPhase, "home" | "history" | "about">): void {
    const state = this.options.getState();
    if (phase === "home" && state.activeAnalysis?.terminal && state.workspace) {
      this.options.persistence.clearActiveAnalysis(state.workspace.workspace_id);
      this.options.dispatch({ type: "TERMINAL_CLEARED" });
      return;
    }
    this.options.dispatch({ type: "NAVIGATED", phase });
  }

  async startAnalysis(draft: PortfolioDraft): Promise<void> {
    const state = this.options.getState();
    if (!state.workspace) return;
    this.options.dispatch({ type: "ANALYSIS_STARTING" });
    const saved = await this.persistDraft(draft, ++this.draftRevision);
    if (!saved) return;
    try {
      const started = await this.options.gateway.startAnalysis();
      this.options.persistence.setActiveAnalysis(state.workspace.workspace_id, started.analysis_id);
      this.options.dispatch({ type: "ANALYSIS_STARTED", analysisId: started.analysis_id });
      await this.refreshAnalysis(started.analysis_id);
    } catch {
      this.options.dispatch({
        type: "DRAFT_SAVE_FAILED",
        message: "复盘未能发起；当前草稿仍保留，可以稍后重试。",
      });
    }
  }

  /**
   * Mascot entry: today's review runs once automatically. An in-flight task is
   * resumed, an already-completed same-day record opens its immutable long card,
   * and only a day without a readable record starts a new analysis.
   */
  async startToday(draft: PortfolioDraft): Promise<void> {
    const state = this.options.getState();
    if (!state.workspace) return;
    const active = state.activeAnalysis;
    if (active && !active.terminal) {
      await this.resumeAnalysis(active.analysisId);
      return;
    }
    if (active?.terminal?.displayable && active.resultInput) {
      this.openCurrentResult();
      return;
    }
    if (await this.openTodayRecord(state.workspace.workspace_id)) return;
    await this.startAnalysis(draft);
  }

  private async openTodayRecord(workspaceId: string): Promise<boolean> {
    try {
      const history = await this.options.gateway.list(workspaceId);
      const today = history
        .filter((item) =>
          item.readability === "readable" &&
          isSameLocalDay(item.analysis_completed_at, new Date()),
        )
        .sort((a, b) => Date.parse(b.analysis_completed_at) - Date.parse(a.analysis_completed_at));
      const latest = today[0];
      if (!latest) return false;
      const replay = await this.options.gateway.replayHistory(latest.record_id);
      if (replay.status !== "replayed") return false;
      const input = historyInput(replay.record, historyExampleLabel(replay.record));
      if (!journeyLongCardIsDisplayable(input)) return false;
      this.options.dispatch({ type: "RESULT_OPENED", input, returnTo: "home" });
      return true;
    } catch {
      return false;
    }
  }

  leaveAnalysis(): void {
    this.options.dispatch({ type: "ANALYSIS_LEFT" });
  }

  async resumeAnalysis(analysisId: string): Promise<void> {
    this.options.dispatch({ type: "ANALYSIS_RESUMED", analysisId });
    await this.refreshAnalysis(analysisId);
  }

  async refreshAnalysis(analysisId: string): Promise<void> {
    if (this.refreshes.has(analysisId)) return;
    this.refreshes.add(analysisId);
    try {
      const [status, events] = await Promise.all([
        this.options.gateway.getAnalysisStatus(analysisId),
        this.options.gateway.getAnalysisEvents(analysisId),
      ]);
      const current = this.options.getState().activeAnalysis;
      const connection = current?.connection === "disconnected" || current?.connection === "reconnecting"
        ? "recovered"
        : "connected";
      this.options.dispatch({
        type: "ANALYSIS_REFRESHED",
        analysisId,
        connection,
        events,
      });
      if (status.state === "terminal") await this.finishTerminal(status);
    } catch (error) {
      this.options.dispatch({
        type: "ANALYSIS_DISCONNECTED",
        analysisId,
        message: analysisFailureMessage(error),
      });
    } finally {
      this.refreshes.delete(analysisId);
    }
  }

  private async finishTerminal(status: AnalysisStatusResponse): Promise<void> {
    const analysisId = status.analysis_id;
    const mappedReason = terminalReason(status.terminal_reason);
    let result: AnalysisResultResponse;
    try {
      result = await this.options.gateway.getAnalysisResult(analysisId);
    } catch {
      this.options.dispatch({
        type: "ANALYSIS_TERMINAL",
        analysisId,
        terminal: terminalUnavailable(
          analysisId,
          "终态结果未通过校验，未展示任何部分长笺。",
          "persistence_failure",
        ),
      });
      return;
    }
    if (result.status === "pending") return;
    if (result.status === "unavailable") {
      this.options.dispatch({
        type: "ANALYSIS_TERMINAL",
        analysisId,
        terminal: terminalUnavailable(analysisId, result.reason, mappedReason),
      });
      return;
    }
    if (result.analysis.status === "unavailable") {
      this.options.dispatch({
        type: "ANALYSIS_TERMINAL",
        analysisId,
        completedAt: result.analysis.analysis_completed_at,
        terminal: terminalUnavailable(
          analysisId,
          result.analysis.limitations.join(" ") || "当前证据不足，未生成正常观象长笺。",
          mappedReason,
        ),
      });
      return;
    }

    const replay = await this.options.gateway.replayHistory(analysisId);
    if (
      replay.status !== "replayed" ||
      replay.record.analysis.analysis_id !== result.analysis.analysis_id ||
      JSON.stringify(replay.record.analysis) !== JSON.stringify(result.analysis)
    ) {
      this.options.dispatch({
        type: "ANALYSIS_TERMINAL",
        analysisId,
        terminal: terminalUnavailable(
          analysisId,
          "不可变快照或历史结果尚不可核对，未展示正常长笺。",
          "persistence_failure",
        ),
      });
      return;
    }
    const input = historyInput(replay.record, result.source.label);
    // Relaxed Demo mode: either a matching free-text narrative or a matching
    // theme narrative makes the card displayable over the same analysis shell.
    const narrativeMatch = Boolean(result.narrative) &&
      JSON.stringify(replay.record.narrative) === JSON.stringify(result.narrative);
    const aiTextMatch = Boolean(result.aiText) && replay.record.ai_text === result.aiText;
    const displayable = (narrativeMatch || aiTextMatch) &&
      journeyLongCardIsDisplayable(input);
    const terminal: AnalysisProgressTerminal = {
      analysis_id: analysisId,
      displayable,
      reason: displayable
        ? result.source.label
        : "模型叙事缺失或与快照不一致，未展示不完整长笺。",
      status: result.analysis.status,
      terminal_reason: displayable ? mappedReason : "model_failure",
    };
    this.options.dispatch({
      type: "ANALYSIS_TERMINAL",
      analysisId,
      completedAt: result.analysis.analysis_completed_at,
      terminal,
      ...(displayable ? { resultInput: input } : {}),
    });
  }

  openCurrentResult(): void {
    const input = this.options.getState().activeAnalysis?.resultInput;
    if (!input || !journeyLongCardIsDisplayable(input)) return;
    this.options.dispatch({ type: "RESULT_OPENED", input, returnTo: "home" });
  }

  /** Relaxed Demo mode: record cumulative free-text model output while running. */
  applyStreamText(analysisId: string, text: string): void {
    this.options.dispatch({ type: "ANALYSIS_STREAM_UPDATED", analysisId, text });
  }

  async openHistoryRecord(recordId: string): Promise<void> {
    try {
      const replay = await this.options.gateway.replayHistory(recordId);
      if (replay.status !== "replayed") throw new Error("history_not_replayable");
      const input = historyInput(replay.record, historyExampleLabel(replay.record));
      if (!journeyLongCardIsDisplayable(input)) throw new Error("history_not_displayable");
      this.options.dispatch({ type: "RESULT_OPENED", input, returnTo: "history" });
    } catch {
      this.options.dispatch({
        type: "HISTORY_RECORD_FAILED",
        message: "这条历史没有完整且版本一致的长笺，未使用当前数据重新生成。",
      });
    }
  }

  async deleteWorkspace(): Promise<void> {
    const workspaceId = this.options.getState().workspace?.workspace_id;
    if (!workspaceId) return;
    try {
      await this.options.gateway.deleteWorkspace();
      this.options.persistence.clearWorkspace(workspaceId);
      this.options.dispatch({ type: "WORKSPACE_DELETED" });
    } catch {
      this.options.dispatch({
        type: "HISTORY_RECORD_FAILED",
        message: "工作区删除未完成，当前内容仍保留。请稍后重试。",
      });
    }
  }
}

export type { DemoExperienceIdentity };
