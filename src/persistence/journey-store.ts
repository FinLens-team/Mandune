import type { PortfolioDraft, TaskEvent } from "../contracts/index.js";
import type {
  AnalysisExecution,
  CreateRunResult,
  JourneyStore,
  StoredAnalysisRun,
} from "../app/server/types.js";
import { PersistenceError } from "./errors.js";
import type { SqliteDatabase } from "./database.js";

interface DraftRow {
  draft_json: string;
}

interface RunRow {
  workspace_id: string;
  analysis_id: string;
  snapshot_json: string;
  state: StoredAnalysisRun["state"];
  created_at: string;
  updated_at: string;
  terminal_reason: string | null;
  retryable: number | bigint;
  execution_json: string | null;
}

interface EventRow {
  event_json: string;
}

function decodeRun(row: RunRow): StoredAnalysisRun {
  return {
    workspace_id: row.workspace_id,
    analysis_id: row.analysis_id,
    snapshot: JSON.parse(row.snapshot_json) as StoredAnalysisRun["snapshot"],
    state: row.state,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(row.terminal_reason ? { terminal_reason: row.terminal_reason } : {}),
    retryable: Number(row.retryable) === 1,
    ...(row.execution_json
      ? { execution: JSON.parse(row.execution_json) as AnalysisExecution }
      : {}),
  };
}

export class SqliteJourneyStore implements JourneyStore {
  constructor(private readonly database: SqliteDatabase) {}

  async getDraft(workspaceId: string): Promise<PortfolioDraft | null> {
    return this.database.read(() => {
      const row = this.database.prepare(
        "SELECT draft_json FROM current_drafts WHERE workspace_id = ?",
      ).get(workspaceId) as DraftRow | undefined;
      return row ? JSON.parse(row.draft_json) as PortfolioDraft : null;
    });
  }

  async putDraft(workspaceId: string, draft: PortfolioDraft): Promise<void> {
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO current_drafts (workspace_id, draft_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          draft_json = excluded.draft_json,
          updated_at = excluded.updated_at
      `).run(workspaceId, JSON.stringify(draft), draft.updated_at);
    });
  }

  async createRun(run: StoredAnalysisRun): Promise<CreateRunResult> {
    try {
      return this.database.transaction(() => {
        const active = this.selectActive(run.workspace_id);
        if (active) return { created: false, run: decodeRun(active) };
        this.database.prepare(`
          INSERT INTO analysis_runs (
            workspace_id, analysis_id, snapshot_json, state,
            created_at, updated_at, terminal_reason, retryable, execution_json
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL)
        `).run(
          run.workspace_id,
          run.analysis_id,
          JSON.stringify(run.snapshot),
          run.state,
          run.created_at,
          run.updated_at,
        );
        return { created: true, run };
      });
    } catch (error) {
      if (!(error instanceof PersistenceError)) throw error;
      const active = this.database.read(() => this.selectActive(run.workspace_id));
      if (active) return { created: false, run: decodeRun(active) };
      throw error;
    }
  }

  async markRunning(workspaceId: string, analysisId: string, updatedAt: string): Promise<boolean> {
    return this.database.transaction(() => {
      const result = this.database.prepare(`
        UPDATE analysis_runs SET state = 'running', updated_at = ?
        WHERE workspace_id = ? AND analysis_id = ? AND state = 'queued'
      `).run(updatedAt, workspaceId, analysisId);
      return Number(result.changes) === 1;
    });
  }

  async appendEvent(workspaceId: string, analysisId: string, event: TaskEvent): Promise<boolean> {
    return this.database.transaction(() => {
      const run = this.database.prepare(`
        SELECT 1 AS present FROM analysis_runs
        WHERE workspace_id = ? AND analysis_id = ?
      `).get(workspaceId, analysisId);
      if (!run) return false;
      const row = this.database.prepare(`
        SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
        FROM analysis_events WHERE workspace_id = ? AND analysis_id = ?
      `).get(workspaceId, analysisId) as { next_sequence: number | bigint };
      this.database.prepare(`
        INSERT INTO analysis_events (workspace_id, analysis_id, sequence, event_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(workspace_id, analysis_id, event_json) DO NOTHING
      `).run(workspaceId, analysisId, Number(row.next_sequence), JSON.stringify(event));
      return true;
    });
  }

  async completeRun(input: {
    workspaceId: string;
    analysisId: string;
    updatedAt: string;
    terminalReason: string;
    retryable: boolean;
    execution?: AnalysisExecution;
  }): Promise<boolean> {
    return this.database.transaction(() => {
      const result = this.database.prepare(`
        UPDATE analysis_runs SET
          state = 'terminal', updated_at = ?, terminal_reason = ?,
          retryable = ?, execution_json = ?
        WHERE workspace_id = ? AND analysis_id = ? AND state <> 'terminal'
      `).run(
        input.updatedAt,
        input.terminalReason,
        input.retryable ? 1 : 0,
        input.execution ? JSON.stringify(input.execution) : null,
        input.workspaceId,
        input.analysisId,
      );
      return Number(result.changes) === 1;
    });
  }

  async getRun(workspaceId: string, analysisId: string): Promise<StoredAnalysisRun | null> {
    return this.database.read(() => {
      const row = this.database.prepare(`
        SELECT workspace_id, analysis_id, snapshot_json, state, created_at,
          updated_at, terminal_reason, retryable, execution_json
        FROM analysis_runs WHERE workspace_id = ? AND analysis_id = ?
      `).get(workspaceId, analysisId) as RunRow | undefined;
      return row ? decodeRun(row) : null;
    });
  }

  async listEvents(workspaceId: string, analysisId: string): Promise<TaskEvent[]> {
    return this.database.read(() => {
      const rows = this.database.prepare(`
        SELECT event_json FROM analysis_events
        WHERE workspace_id = ? AND analysis_id = ? ORDER BY sequence
      `).all(workspaceId, analysisId) as unknown as EventRow[];
      return rows.map((row) => JSON.parse(row.event_json) as TaskEvent);
    });
  }

  async recoverInterruptedRuns(recoveredAt: string): Promise<number> {
    return this.recoverInterruptedRunsNow(recoveredAt);
  }

  recoverInterruptedRunsNow(recoveredAt: string): number {
    return this.database.transaction(() => {
      const rows = this.database.prepare(`
        SELECT workspace_id, analysis_id, snapshot_json, state, created_at,
          updated_at, terminal_reason, retryable, execution_json
        FROM analysis_runs WHERE state IN ('queued', 'running')
        ORDER BY workspace_id, analysis_id
      `).all() as unknown as RunRow[];
      for (const row of rows) {
        const sequence = this.database.prepare(`
          SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
          FROM analysis_events WHERE workspace_id = ? AND analysis_id = ?
        `).get(row.workspace_id, row.analysis_id) as { next_sequence: number | bigint };
        const event: TaskEvent = {
          event_id: `${row.analysis_id}:recovery:${Number(sequence.next_sequence)}`,
          analysis_id: row.analysis_id,
          stage: "persist_or_return",
          state: "failed",
          occurred_at: recoveredAt,
          message: "服务重启中断了分析，请重新发起复盘。",
        };
        this.database.prepare(`
          INSERT INTO analysis_events (workspace_id, analysis_id, sequence, event_json)
          VALUES (?, ?, ?, ?)
        `).run(row.workspace_id, row.analysis_id, Number(sequence.next_sequence), JSON.stringify(event));
      }
      this.database.prepare(`
        UPDATE analysis_runs SET
          state = 'terminal', updated_at = ?, terminal_reason = 'restart_interrupted',
          retryable = 1, execution_json = NULL
        WHERE state IN ('queued', 'running')
      `).run(recoveredAt);
      return rows.length;
    });
  }

  private selectActive(workspaceId: string): RunRow | undefined {
    return this.database.prepare(`
      SELECT workspace_id, analysis_id, snapshot_json, state, created_at,
        updated_at, terminal_reason, retryable, execution_json
      FROM analysis_runs
      WHERE workspace_id = ? AND state IN ('queued', 'running')
      ORDER BY created_at, analysis_id LIMIT 1
    `).get(workspaceId) as RunRow | undefined;
  }
}
