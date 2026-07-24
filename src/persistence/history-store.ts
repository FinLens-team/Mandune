import type { AnalysisCommitFence } from "../analysis/index.js";
import type {
  HistoryAppendResult,
  HistoryStore,
  StoredHistoryEnvelope,
} from "../history/index.js";
import type { SqliteDatabase } from "./database.js";

interface EnvelopeRow {
  envelope_json: string;
}

function fenceIsOpen(fence: AnalysisCommitFence): boolean {
  try {
    return !fence.signal.aborted && fence.canCommit();
  } catch {
    return false;
  }
}

function decode(row: EnvelopeRow): StoredHistoryEnvelope {
  return JSON.parse(row.envelope_json) as StoredHistoryEnvelope;
}

export class SqliteHistoryStore implements HistoryStore {
  constructor(private readonly database: SqliteDatabase) {}

  async append(
    record: StoredHistoryEnvelope,
    fence: AnalysisCommitFence,
  ): Promise<HistoryAppendResult> {
    const bytes = JSON.stringify(record);
    return this.database.transaction(() => {
      const erased = this.database.prepare(
        "SELECT 1 AS present FROM workspace_tombstones WHERE workspace_id = ?",
      ).get(record.workspace_id);
      const workspace = this.database.prepare(
        "SELECT 1 AS present FROM workspaces WHERE workspace_id = ?",
      ).get(record.workspace_id);
      if (erased || !workspace) return "workspace_erased";

      const existing = this.database.prepare(`
        SELECT envelope_json FROM history_records
        WHERE workspace_id = ? AND record_id = ?
      `).get(record.workspace_id, record.record_id) as EnvelopeRow | undefined;
      if (existing) return existing.envelope_json === bytes ? "idempotent" : "conflict";
      const duplicateAnalysis = this.database.prepare(`
        SELECT envelope_json FROM history_records
        WHERE workspace_id = ? AND analysis_id = ?
      `).get(record.workspace_id, record.analysis_id) as EnvelopeRow | undefined;
      if (duplicateAnalysis) return duplicateAnalysis.envelope_json === bytes ? "idempotent" : "conflict";
      if (!fenceIsOpen(fence)) return "fence_closed";

      this.database.prepare(`
        INSERT INTO history_records (
          workspace_id, record_id, analysis_id, snapshot_id,
          analysis_completed_at, evidence_cutoff_at, result_status, theme_id,
          history_schema_version, contracts_version, rational_analysis_version,
          theme_narrative_version, envelope_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.workspace_id,
        record.record_id,
        record.analysis_id,
        record.snapshot_id,
        record.analysis_completed_at,
        record.evidence_cutoff_at,
        record.result_status,
        record.theme_id,
        record.versions.history_schema,
        record.versions.contracts,
        record.versions.rational_analysis,
        record.versions.theme_narrative,
        bytes,
      );
      return "committed";
    });
  }

  async get(workspaceId: string, recordId: string): Promise<StoredHistoryEnvelope | null> {
    return this.database.read(() => {
      const row = this.database.prepare(`
        SELECT envelope_json FROM history_records
        WHERE workspace_id = ? AND record_id = ?
      `).get(workspaceId, recordId) as EnvelopeRow | undefined;
      return row ? decode(row) : null;
    });
  }

  async list(workspaceId: string): Promise<StoredHistoryEnvelope[]> {
    return this.database.read(() => {
      const rows = this.database.prepare(`
        SELECT envelope_json FROM history_records
        WHERE workspace_id = ?
        ORDER BY analysis_completed_at DESC, analysis_id
      `).all(workspaceId) as unknown as EnvelopeRow[];
      return rows.map(decode);
    });
  }

  async eraseWorkspace(workspaceId: string): Promise<number> {
    return this.database.transaction(() => {
      const countRow = this.database.prepare(`
        SELECT count(*) AS count FROM history_records WHERE workspace_id = ?
      `).get(workspaceId) as { count: number | bigint };
      this.database.prepare(`
        INSERT INTO workspace_tombstones (workspace_id, deleted_at)
        VALUES (?, ?)
        ON CONFLICT(workspace_id) DO NOTHING
      `).run(workspaceId, new Date().toISOString());
      this.database.prepare("DELETE FROM history_records WHERE workspace_id = ?").run(workspaceId);
      return Number(countRow.count);
    });
  }
}
