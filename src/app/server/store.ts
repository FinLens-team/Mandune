import type { PortfolioDraft, TaskEvent } from "../../contracts/index.js";
import type {
  AnalysisExecution,
  CreateRunResult,
  JourneyStore,
  StoredAnalysisRun,
} from "./types.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryJourneyStore implements JourneyStore {
  private readonly drafts = new Map<string, PortfolioDraft>();
  private readonly runs = new Map<string, Map<string, StoredAnalysisRun>>();
  private readonly events = new Map<string, Map<string, TaskEvent[]>>();

  async getDraft(workspaceId: string): Promise<PortfolioDraft | null> {
    const draft = this.drafts.get(workspaceId);
    return draft ? clone(draft) : null;
  }

  async putDraft(workspaceId: string, draft: PortfolioDraft): Promise<void> {
    this.drafts.set(workspaceId, clone(draft));
  }

  async createRun(run: StoredAnalysisRun): Promise<CreateRunResult> {
    const byId = this.runs.get(run.workspace_id) ?? new Map<string, StoredAnalysisRun>();
    const active = [...byId.values()].find((item) => item.state !== "terminal");
    if (active) return { created: false, run: clone(active) };
    byId.set(run.analysis_id, clone(run));
    this.runs.set(run.workspace_id, byId);
    return { created: true, run: clone(run) };
  }

  async markRunning(workspaceId: string, analysisId: string, updatedAt: string): Promise<boolean> {
    const run = this.runs.get(workspaceId)?.get(analysisId);
    if (!run || run.state !== "queued") return false;
    run.state = "running";
    run.updated_at = updatedAt;
    return true;
  }

  async appendEvent(workspaceId: string, analysisId: string, event: TaskEvent): Promise<boolean> {
    if (!this.runs.get(workspaceId)?.has(analysisId)) return false;
    const byId = this.events.get(workspaceId) ?? new Map<string, TaskEvent[]>();
    const list = byId.get(analysisId) ?? [];
    if (!list.some((item) => item.event_id === event.event_id)) list.push(clone(event));
    byId.set(analysisId, list);
    this.events.set(workspaceId, byId);
    return true;
  }

  async completeRun(input: {
    workspaceId: string;
    analysisId: string;
    updatedAt: string;
    terminalReason: string;
    retryable: boolean;
    execution?: AnalysisExecution;
  }): Promise<boolean> {
    const run = this.runs.get(input.workspaceId)?.get(input.analysisId);
    if (!run || run.state === "terminal") return false;
    run.state = "terminal";
    run.updated_at = input.updatedAt;
    run.terminal_reason = input.terminalReason;
    run.retryable = input.retryable;
    run.execution = input.execution ? clone(input.execution) : undefined;
    return true;
  }

  async getRun(workspaceId: string, analysisId: string): Promise<StoredAnalysisRun | null> {
    const run = this.runs.get(workspaceId)?.get(analysisId);
    return run ? clone(run) : null;
  }

  async listEvents(workspaceId: string, analysisId: string): Promise<TaskEvent[]> {
    return clone(this.events.get(workspaceId)?.get(analysisId) ?? []);
  }

  async recoverInterruptedRuns(recoveredAt: string): Promise<number> {
    let count = 0;
    for (const [workspaceId, byId] of this.runs) {
      for (const run of byId.values()) {
        if (run.state === "terminal") continue;
        count += 1;
        const list = this.events.get(workspaceId)?.get(run.analysis_id) ?? [];
        list.push({
          event_id: `${run.analysis_id}:recovery:${list.length + 1}`,
          analysis_id: run.analysis_id,
          stage: "persist_or_return",
          state: "failed",
          occurred_at: recoveredAt,
          message: "服务重启中断了分析，请重新发起复盘。",
        });
        const byAnalysis = this.events.get(workspaceId) ?? new Map<string, TaskEvent[]>();
        byAnalysis.set(run.analysis_id, list);
        this.events.set(workspaceId, byAnalysis);
        run.state = "terminal";
        run.updated_at = recoveredAt;
        run.terminal_reason = "restart_interrupted";
        run.retryable = true;
        delete run.execution;
      }
    }
    return count;
  }
}
