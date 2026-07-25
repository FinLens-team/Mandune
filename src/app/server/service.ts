import { randomUUID } from "node:crypto";
import type { AtlasService } from "../../atlas/index.js";
import {
  validatePortfolioDraft,
  validatePortfolioSnapshot,
  validateTaskEvent,
  type PortfolioDraft,
  type TaskEvent,
} from "../../contracts/index.js";
import {
  HistoryService,
  isHistoryExperienceSource,
  type HistoryExperienceSource,
} from "../../history/index.js";
import { createSnapshotFromDraft } from "../../portfolio/index.js";
import { DEFAULT_THEME_ID, type ThemeId } from "../../theme/index.js";
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

/** Relaxed Demo mode: SSE event delivered to a stream subscriber. */
export type AnalysisStreamEvent = { type: "delta"; text: string } | { type: "done" };

interface AnalysisStreamState {
  buffer: string;
  done: boolean;
  subscribers: Set<(event: AnalysisStreamEvent) => void>;
}

export class JourneyAnalysisService {
  private readonly tasks = new Map<string, Promise<void>>();
  private readonly streams = new Map<string, AnalysisStreamState>();

  constructor(
    private readonly store: JourneyStore,
    private readonly history: HistoryService,
    private readonly executor: AnalysisExecutor = new FixtureAnalysisExecutor(),
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => `analysis_${randomUUID()}`,
    private readonly atlas?: AtlasService,
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

  async start(
    workspaceId: string,
    experienceSource: HistoryExperienceSource,
    themeId: ThemeId = DEFAULT_THEME_ID,
  ): Promise<{ created: boolean; run: StoredAnalysisRun }> {
    if (!isHistoryExperienceSource(experienceSource)) throw new JourneyInputError("invalid_draft");
    const draft = await this.getDraft(workspaceId);
    if (!draft) throw new JourneyInputError("no_current_draft");
    const snapshotResult = createSnapshotFromDraft(draft, { theme_id: themeId });
    if (!snapshotResult.ok) throw new JourneyInputError("no_usable_lines");
    const snapshot = structuredClone(snapshotResult.snapshot);
    if (!validatePortfolioSnapshot(snapshot).ok) throw new JourneyInputError("invalid_draft");
    const createdAt = this.now().toISOString();
    const run: StoredAnalysisRun = {
      workspace_id: workspaceId,
      analysis_id: this.createId(),
      snapshot,
      experience_source: experienceSource,
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

  /**
   * Relaxed Demo mode: subscribe to the free-text model stream for a running
   * analysis. Any already-buffered text is replayed immediately, then deltas
   * are delivered until the stream finishes. Returns an unsubscribe function.
   */
  subscribeStream(analysisId: string, listener: (event: AnalysisStreamEvent) => void): () => void {
    const state = this.getOrCreateStream(analysisId);
    if (state.buffer) listener({ type: "delta", text: state.buffer });
    if (state.done) {
      listener({ type: "done" });
      return () => undefined;
    }
    state.subscribers.add(listener);
    return () => {
      state.subscribers.delete(listener);
    };
  }

  private getOrCreateStream(analysisId: string): AnalysisStreamState {
    let state = this.streams.get(analysisId);
    if (!state) {
      state = { buffer: "", done: false, subscribers: new Set() };
      this.streams.set(analysisId, state);
    }
    return state;
  }

  private pushStreamDelta(analysisId: string, delta: string): void {
    if (!delta) return;
    const state = this.getOrCreateStream(analysisId);
    state.buffer += delta;
    // Deltas carry the full cumulative text so replays and auto-reconnects are
    // idempotent: subscribers replace, they never append.
    for (const listener of state.subscribers) {
      try {
        listener({ type: "delta", text: state.buffer });
      } catch {
        // A failed subscriber must not interrupt streaming or other listeners.
      }
    }
  }

  private finishStream(analysisId: string, finalText?: string): void {
    const state = this.getOrCreateStream(analysisId);
    if (state.done) return;
    if (finalText && finalText.length > state.buffer.length) state.buffer = finalText;
    state.done = true;
    for (const listener of state.subscribers) {
      try {
        listener({ type: "done" });
      } catch {
        // Ignore subscriber failures on completion.
      }
    }
    state.subscribers.clear();
    // Keep the buffer briefly so brief reconnects can replay, then release it.
    // Late subscribers after this window fall back to the persisted result.
    setTimeout(() => this.streams.delete(analysisId), 300_000).unref?.();
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
        workspaceId: run.workspace_id,
        analysisId: run.analysis_id,
        snapshot: run.snapshot,
        emit,
        now: this.now,
        onText: (delta) => this.pushStreamDelta(run.analysis_id, delta),
      });
      this.finishStream(run.analysis_id);
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
      try {
        if (execution.generated_review && execution.review_packet) {
          await this.atlas?.consume({
            workspaceId: run.workspace_id,
            analysis: execution.analysis,
            snapshot: run.snapshot,
            candidates: execution.generated_review.atlas_candidates ?? (
              execution.generated_review.atlas_candidate
                ? [execution.generated_review.atlas_candidate]
                : []
            ),
            reportMarkdown: execution.generated_review.persona_report.markdown,
            allowed_reference_ids: [
              ...execution.review_packet.fact_ids,
              ...execution.review_packet.event_ids,
            ],
            ...(execution.generated_review.atlas_validation === "invalid_candidate"
              ? { invalid_candidate: true }
              : {}),
          });
        } else {
          await this.atlas?.start({
            workspaceId: run.workspace_id,
            analysis: execution.analysis,
            snapshot: run.snapshot,
            reportMarkdown: execution.ai_theme_text ?? execution.ai_text,
          });
        }
      } catch {
        // 图鉴是非阻塞后置任务，初始化失败不能改写已完成复盘。
      }
    } catch {
      this.finishStream(run.analysis_id);
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
        ...(execution.ai_text ? { ai_text: execution.ai_text } : {}),
        ...(execution.ai_theme_text ? { ai_theme_text: execution.ai_theme_text } : {}),
        ...(execution.review_packet ? { review_packet: execution.review_packet } : {}),
        ...(execution.generated_review ? { generated_review: execution.generated_review } : {}),
        ...(execution.model_id ? { model_id: execution.model_id } : {}),
        ...(execution.prompt_version ? { prompt_version: execution.prompt_version } : {}),
        ...(execution.skill_versions ? { skill_versions: execution.skill_versions } : {}),
        ...(execution.atlas_policy_version
          ? { atlas_policy_version: execution.atlas_policy_version }
          : {}),
        ...(run.experience_source ? { experience_source: run.experience_source } : {}),
      }, {
        signal: controller.signal,
        canCommit: () => open && !controller.signal.aborted,
      });
    } finally {
      open = false;
    }
  }
}
