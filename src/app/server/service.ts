import { randomUUID } from "node:crypto";
import {
  validatePortfolioDraft,
  validatePortfolioSnapshot,
  validateTaskEvent,
  type PortfolioDraft,
  type TaskEvent,
} from "../../contracts/index.js";
import { HistoryService } from "../../history/index.js";
import { createSnapshotFromDraft } from "../../portfolio/index.js";
import { FixtureAnalysisExecutor } from "./fixture-executor.js";
import type {
  AnalysisExecutor,
  AnalysisExecution,
  JourneyStore,
  StoredAnalysisRun,
} from "./types.js";

export class JourneyInputError extends Error {
  constructor(readonly code: "invalid_draft" | "no_current_draft" | "no_usable_lines") {
    super(code);
    this.name = "JourneyInputError";
  }
}

export class JourneyAnalysisService {
  private readonly tasks = new Map<string, Promise<void>>();

  constructor(
    private readonly store: JourneyStore,
    private readonly history: HistoryService,
    private readonly executor: AnalysisExecutor = new FixtureAnalysisExecutor(),
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => `analysis_${randomUUID()}`,
  ) {}

  async getDraft(workspaceId: string): Promise<PortfolioDraft | null> {
    const draft = await this.store.getDraft(workspaceId);
    if (!draft) return null;
    const checked = validatePortfolioDraft(draft);
    if (!checked.ok) throw new JourneyInputError("invalid_draft");
    return structuredClone(checked.value);
  }

  async putDraft(workspaceId: string, value: unknown): Promise<PortfolioDraft> {
    const checked = validatePortfolioDraft(value);
    if (!checked.ok || JSON.stringify(value).length > 1_000_000) {
      throw new JourneyInputError("invalid_draft");
    }
    const draft = structuredClone(checked.value);
    await this.store.putDraft(workspaceId, draft);
    return structuredClone(draft);
  }

  async start(workspaceId: string): Promise<{ created: boolean; run: StoredAnalysisRun }> {
    const draft = await this.getDraft(workspaceId);
    if (!draft) throw new JourneyInputError("no_current_draft");
    const snapshotResult = createSnapshotFromDraft(draft);
    if (!snapshotResult.ok) throw new JourneyInputError("no_usable_lines");
    const snapshot = structuredClone(snapshotResult.snapshot);
    if (!validatePortfolioSnapshot(snapshot).ok) throw new JourneyInputError("invalid_draft");
    const createdAt = this.now().toISOString();
    const run: StoredAnalysisRun = {
      workspace_id: workspaceId,
      analysis_id: this.createId(),
      snapshot,
      state: "queued",
      created_at: createdAt,
      updated_at: createdAt,
      retryable: false,
    };
    const result = await this.store.createRun(run);
    if (result.created) {
      const task = this.executeRun(result.run).finally(() => this.tasks.delete(result.run.analysis_id));
      this.tasks.set(result.run.analysis_id, task);
    }
    return result;
  }

  async getRun(workspaceId: string, analysisId: string): Promise<StoredAnalysisRun | null> {
    return this.store.getRun(workspaceId, analysisId);
  }

  async getEvents(workspaceId: string, analysisId: string): Promise<TaskEvent[] | null> {
    if (!await this.store.getRun(workspaceId, analysisId)) return null;
    const events = await this.store.listEvents(workspaceId, analysisId);
    return events.filter((event) => validateTaskEvent(event).ok);
  }

  async waitForIdle(): Promise<void> {
    await Promise.allSettled([...this.tasks.values()]);
  }

  private async executeRun(run: StoredAnalysisRun): Promise<void> {
    let eventCounter = 0;
    let eventWrites = Promise.resolve();
    const emit = (
      stage: TaskEvent["stage"],
      state: TaskEvent["state"],
      extra: Partial<TaskEvent> = {},
    ): void => {
      const event: TaskEvent = {
        event_id: `${run.analysis_id}:event:${++eventCounter}`,
        analysis_id: run.analysis_id,
        stage,
        state,
        occurred_at: this.now().toISOString(),
        ...(extra.message ? { message: extra.message } : {}),
        ...(extra.covered_count !== undefined ? { covered_count: extra.covered_count } : {}),
        ...(extra.retry_count !== undefined ? { retry_count: extra.retry_count } : {}),
      };
      if (!validateTaskEvent(event).ok) throw new Error("invalid_task_event");
      eventWrites = eventWrites.then(async () => {
        await this.store.appendEvent(run.workspace_id, run.analysis_id, event);
      });
    };

    try {
      const marked = await this.store.markRunning(run.workspace_id, run.analysis_id, this.now().toISOString());
      if (!marked) return;
      const execution = await this.executor.execute({
        analysisId: run.analysis_id,
        snapshot: run.snapshot,
        emit,
        now: this.now,
      });
      await eventWrites;
      emit("persist_or_return", "pending", {
        covered_count: execution.analysis.coverage.covered_line_ids.length,
      });
      emit("persist_or_return", "running", {
        covered_count: execution.analysis.coverage.covered_line_ids.length,
        message: "保存不可变已校验结果。",
      });
      await eventWrites;
      await this.saveHistory(run, execution);
      emit("persist_or_return", "succeeded", {
        covered_count: execution.analysis.coverage.covered_line_ids.length,
      });
      await eventWrites;
      await this.store.completeRun({
        workspaceId: run.workspace_id,
        analysisId: run.analysis_id,
        updatedAt: this.now().toISOString(),
        terminalReason: execution.analysis.status === "unavailable" ? "unavailable" : "completed",
        retryable: execution.analysis.status === "unavailable",
        execution,
      });
    } catch {
      try {
        const failure: TaskEvent = {
          event_id: `${run.analysis_id}:event:${++eventCounter}`,
          analysis_id: run.analysis_id,
          stage: "persist_or_return",
          state: "failed",
          occurred_at: this.now().toISOString(),
          message: "分析未能保存，请重新发起复盘。",
        };
        await this.store.appendEvent(run.workspace_id, run.analysis_id, failure);
        await this.store.completeRun({
          workspaceId: run.workspace_id,
          analysisId: run.analysis_id,
          updatedAt: this.now().toISOString(),
          terminalReason: "execution_failed",
          retryable: true,
        });
      } catch {
        // A deleted workspace or failed database remains inaccessible and cannot leak payloads.
      }
    }
  }

  private async saveHistory(run: StoredAnalysisRun, execution: AnalysisExecution): Promise<void> {
    const controller = new AbortController();
    let open = true;
    try {
      await this.history.createResultSink(run.workspace_id, run.snapshot).save({
        analysis: execution.analysis,
        rational_analysis_version: execution.rational_analysis_version,
        ...(execution.narrative ? { narrative: execution.narrative } : {}),
      }, {
        signal: controller.signal,
        canCommit: () => open && !controller.signal.aborted,
      });
    } finally {
      open = false;
    }
  }
}
