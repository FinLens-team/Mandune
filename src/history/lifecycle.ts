import { WorkspaceService, type WorkspaceDeleteResult } from "../workspace/index.js";
import type { HistoryService } from "./service.js";

export type HistoryWorkspaceDeleteResult =
  | {
      ok: true;
      result: WorkspaceDeleteResult;
      history_deleted_count: number;
    }
  | { ok: false; code: "unauthorized" }
  | { ok: false; code: "cascade_failed"; workspace_id: string };

/**
 * The application must use this adapter for active delete and TTL cleanup so
 * #26 workspace removal and history erasure complete as one observable flow.
 */
export class HistoryWorkspaceLifecycle {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly history: HistoryService,
  ) {}

  async delete(locator: string | undefined | null): Promise<HistoryWorkspaceDeleteResult> {
    const deletion = await this.workspaces.delete(locator);
    if (!deletion.ok) return deletion;
    try {
      const historyDeleted = await this.history.eraseWorkspace(deletion.result.workspace_id);
      return { ok: true, result: deletion.result, history_deleted_count: historyDeleted };
    } catch {
      return {
        ok: false,
        code: "cascade_failed",
        workspace_id: deletion.result.workspace_id,
      };
    }
  }

  async purgeExpired(): Promise<{
    purged: string[];
    failed: string[];
    history_deleted: string[];
    history_failed: string[];
  }> {
    const workspaceResult = await this.workspaces.purgeExpired();
    const historyDeleted: string[] = [];
    const historyFailed: string[] = [];
    for (const workspaceId of workspaceResult.purged) {
      try {
        await this.history.eraseWorkspace(workspaceId);
        historyDeleted.push(workspaceId);
      } catch {
        historyFailed.push(workspaceId);
      }
    }
    return {
      ...workspaceResult,
      history_deleted: historyDeleted,
      history_failed: historyFailed,
    };
  }
}
