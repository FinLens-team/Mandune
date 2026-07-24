import type { WorkspaceRecord } from "./types.js";

export interface WorkspaceStore {
  put(record: WorkspaceRecord): Promise<void>;
  getByLocator(locator: string): Promise<WorkspaceRecord | null>;
  getById(workspaceId: string): Promise<WorkspaceRecord | null>;
  deleteById(workspaceId: string): Promise<boolean>;
  listActive(): Promise<WorkspaceRecord[]>;
}

/**
 * Process-local store for Demo V1.
 * Durable engines remain open; this proves isolation/TTL semantics without
 * locking SQLite/Postgres.
 */
export class MemoryWorkspaceStore implements WorkspaceStore {
  private readonly byLocator = new Map<string, WorkspaceRecord>();
  private readonly byId = new Map<string, WorkspaceRecord>();

  async put(record: WorkspaceRecord): Promise<void> {
    this.byLocator.set(record.locator, record);
    this.byId.set(record.workspace_id, record);
  }

  async getByLocator(locator: string): Promise<WorkspaceRecord | null> {
    return this.byLocator.get(locator) ?? null;
  }

  async getById(workspaceId: string): Promise<WorkspaceRecord | null> {
    return this.byId.get(workspaceId) ?? null;
  }

  async deleteById(workspaceId: string): Promise<boolean> {
    const record = this.byId.get(workspaceId);
    if (!record) return false;
    this.byId.delete(workspaceId);
    this.byLocator.delete(record.locator);
    return true;
  }

  async listActive(): Promise<WorkspaceRecord[]> {
    return [...this.byId.values()].filter((item) => !item.deleted_at);
  }
}
