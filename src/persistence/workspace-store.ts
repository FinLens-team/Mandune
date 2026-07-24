import type { WorkspaceRecord, WorkspaceStore } from "../workspace/index.js";
import type { SqliteDatabase } from "./database.js";

interface WorkspaceRow {
  workspace_id: string;
  locator: string;
  created_at: string;
  last_active_at: string;
  expires_at: string;
}

function workspaceRecord(row: WorkspaceRow): WorkspaceRecord {
  return {
    workspace_id: row.workspace_id,
    locator: row.locator,
    created_at: row.created_at,
    last_active_at: row.last_active_at,
    expires_at: row.expires_at,
  };
}

export class SqliteWorkspaceStore implements WorkspaceStore {
  constructor(private readonly database: SqliteDatabase) {}

  async put(record: WorkspaceRecord): Promise<void> {
    this.database.transaction(() => {
      const tombstone = this.database.prepare(
        "SELECT 1 AS present FROM workspace_tombstones WHERE workspace_id = ?",
      ).get(record.workspace_id);
      if (tombstone) throw new Error("workspace is erased");
      this.database.prepare(`
        INSERT INTO workspaces (
          workspace_id, locator, created_at, last_active_at, expires_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          locator = excluded.locator,
          last_active_at = excluded.last_active_at,
          expires_at = excluded.expires_at
      `).run(
        record.workspace_id,
        record.locator,
        record.created_at,
        record.last_active_at,
        record.expires_at,
      );
    });
  }

  async getByLocator(locator: string): Promise<WorkspaceRecord | null> {
    return this.database.read(() => {
      const row = this.database.prepare(`
        SELECT workspace_id, locator, created_at, last_active_at, expires_at
        FROM workspaces WHERE locator = ?
      `).get(locator) as WorkspaceRow | undefined;
      return row ? workspaceRecord(row) : null;
    });
  }

  async getById(workspaceId: string): Promise<WorkspaceRecord | null> {
    return this.database.read(() => {
      const row = this.database.prepare(`
        SELECT workspace_id, locator, created_at, last_active_at, expires_at
        FROM workspaces WHERE workspace_id = ?
      `).get(workspaceId) as WorkspaceRow | undefined;
      return row ? workspaceRecord(row) : null;
    });
  }

  async deleteById(workspaceId: string): Promise<boolean> {
    return this.database.transaction(() => {
      const exists = this.database.prepare(
        "SELECT 1 AS present FROM workspaces WHERE workspace_id = ?",
      ).get(workspaceId);
      if (!exists) return false;
      this.database.prepare(`
        INSERT INTO workspace_tombstones (workspace_id, deleted_at)
        VALUES (?, ?)
        ON CONFLICT(workspace_id) DO NOTHING
      `).run(workspaceId, new Date().toISOString());
      this.database.prepare("DELETE FROM workspaces WHERE workspace_id = ?").run(workspaceId);
      return true;
    });
  }

  async listActive(): Promise<WorkspaceRecord[]> {
    return this.database.read(() => {
      const rows = this.database.prepare(`
        SELECT workspace_id, locator, created_at, last_active_at, expires_at
        FROM workspaces ORDER BY workspace_id
      `).all() as unknown as WorkspaceRow[];
      return rows.map(workspaceRecord);
    });
  }
}
