import type { AnalysisCommitFence } from "../analysis/index.js";
import type { StoredHistoryEnvelope } from "./types.js";

export type HistoryAppendResult =
  | "committed"
  | "idempotent"
  | "conflict"
  | "workspace_erased"
  | "fence_closed";

export interface HistoryStore {
  /** Atomically commits one complete envelope or no bytes at all. */
  append(record: StoredHistoryEnvelope, fence: AnalysisCommitFence): Promise<HistoryAppendResult>;
  get(workspaceId: string, recordId: string): Promise<StoredHistoryEnvelope | null>;
  list(workspaceId: string): Promise<StoredHistoryEnvelope[]>;
  /** Erasure is the only exception to append-only storage. It also fences future writes. */
  eraseWorkspace(workspaceId: string): Promise<number>;
}

function fenceIsOpen(fence: AnalysisCommitFence): boolean {
  try {
    return !fence.signal.aborted && fence.canCommit();
  } catch {
    return false;
  }
}

function parseEnvelope(bytes: string): StoredHistoryEnvelope {
  return JSON.parse(bytes) as StoredHistoryEnvelope;
}

/**
 * Process-local Demo V1 implementation. Each record is retained as one JSON
 * byte string, so callers can never mutate committed state through references.
 */
export class MemoryHistoryStore implements HistoryStore {
  private readonly records = new Map<string, Map<string, string>>();
  private readonly erasedWorkspaces = new Set<string>();

  async append(record: StoredHistoryEnvelope, fence: AnalysisCommitFence): Promise<HistoryAppendResult> {
    const bytes = JSON.stringify(record);
    if (this.erasedWorkspaces.has(record.workspace_id)) return "workspace_erased";

    const existing = this.records.get(record.workspace_id)?.get(record.record_id);
    if (existing !== undefined) return existing === bytes ? "idempotent" : "conflict";

    // No await is allowed between this final fence check and the map mutation.
    if (!fenceIsOpen(fence)) return "fence_closed";
    const workspaceRecords = this.records.get(record.workspace_id) ?? new Map<string, string>();
    workspaceRecords.set(record.record_id, bytes);
    this.records.set(record.workspace_id, workspaceRecords);
    return "committed";
  }

  async get(workspaceId: string, recordId: string): Promise<StoredHistoryEnvelope | null> {
    const bytes = this.records.get(workspaceId)?.get(recordId);
    return bytes === undefined ? null : parseEnvelope(bytes);
  }

  async list(workspaceId: string): Promise<StoredHistoryEnvelope[]> {
    return [...(this.records.get(workspaceId)?.values() ?? [])].map(parseEnvelope);
  }

  async eraseWorkspace(workspaceId: string): Promise<number> {
    const deleted = this.records.get(workspaceId)?.size ?? 0;
    this.erasedWorkspaces.add(workspaceId);
    this.records.delete(workspaceId);
    return deleted;
  }

  /** Test and migration evidence: returns an immutable copy of committed bytes. */
  getBytesForTests(workspaceId: string, recordId: string): string | null {
    return this.records.get(workspaceId)?.get(recordId) ?? null;
  }
}
