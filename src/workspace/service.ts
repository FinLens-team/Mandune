import { randomBytes } from "node:crypto";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import type { WorkspaceStore } from "./store.js";
import { MemoryWorkspaceStore } from "./store.js";
import {
  WORKSPACE_TTL_MS,
  type WorkspaceDeleteResult,
  type WorkspacePublicStatus,
  type WorkspaceRecord,
} from "./types.js";

export type WorkspaceAccessResult =
  | { ok: true; workspace: WorkspaceRecord; status: WorkspacePublicStatus }
  | { ok: false; code: "unauthorized" };

function toIso(date: Date): string {
  return date.toISOString();
}

function publicStatus(record: WorkspaceRecord): WorkspacePublicStatus {
  return {
    workspace_id: record.workspace_id,
    last_active_at: record.last_active_at,
    expires_at: record.expires_at,
    ttl_days: 30,
  };
}

function createLocator(): string {
  return randomBytes(32).toString("base64url");
}

function createWorkspaceId(): string {
  return `ws_${randomBytes(16).toString("hex")}`;
}

export class WorkspaceService {
  constructor(
    private readonly store: WorkspaceStore = new MemoryWorkspaceStore(),
    private readonly clock: Clock = systemClock,
  ) {}

  async create(): Promise<{ record: WorkspaceRecord; status: WorkspacePublicStatus }> {
    const now = this.clock.now();
    const record: WorkspaceRecord = {
      workspace_id: createWorkspaceId(),
      locator: createLocator(),
      created_at: toIso(now),
      last_active_at: toIso(now),
      expires_at: toIso(new Date(now.getTime() + WORKSPACE_TTL_MS)),
    };
    await this.store.put(record);
    return { record, status: publicStatus(record) };
  }

  /**
   * Authorize by opaque locator. Missing, forged, deleted, and expired locators
   * all collapse to the same unauthorized result — no existence leak.
   */
  async authorize(locator: string | undefined | null): Promise<WorkspaceAccessResult> {
    if (!locator || locator.trim().length < 16) {
      return { ok: false, code: "unauthorized" };
    }
    const record = await this.store.getByLocator(locator);
    if (!record || record.deleted_at) {
      return { ok: false, code: "unauthorized" };
    }
    const now = this.clock.now();
    if (new Date(record.expires_at).getTime() <= now.getTime()) {
      return { ok: false, code: "unauthorized" };
    }
    return { ok: true, workspace: record, status: publicStatus(record) };
  }

  async touch(locator: string | undefined | null): Promise<WorkspaceAccessResult> {
    const access = await this.authorize(locator);
    if (!access.ok) return access;
    const now = this.clock.now();
    const updated: WorkspaceRecord = {
      ...access.workspace,
      last_active_at: toIso(now),
      expires_at: toIso(new Date(now.getTime() + WORKSPACE_TTL_MS)),
    };
    await this.store.put(updated);
    return { ok: true, workspace: updated, status: publicStatus(updated) };
  }

  async delete(locator: string | undefined | null): Promise<
    | { ok: true; result: WorkspaceDeleteResult }
    | { ok: false; code: "unauthorized" }
  > {
    const access = await this.authorize(locator);
    if (!access.ok) return access;
    const deletedAt = toIso(this.clock.now());
    const removed = await this.store.deleteById(access.workspace.workspace_id);
    if (!removed) {
      return { ok: false, code: "unauthorized" };
    }
    return {
      ok: true,
      result: {
        workspace_id: access.workspace.workspace_id,
        deleted_at: deletedAt,
        cascade: {
          portfolio: true,
          analysis_history: true,
        },
      },
    };
  }

  /**
   * Background cleanup. Failures for individual rows are collected; partial
   * public leftovers are avoided by deleting the whole record atomically.
   */
  async purgeExpired(): Promise<{ purged: string[]; failed: string[] }> {
    const now = this.clock.now().getTime();
    const active = await this.store.listActive();
    const purged: string[] = [];
    const failed: string[] = [];
    for (const record of active) {
      if (new Date(record.expires_at).getTime() > now) continue;
      try {
        const ok = await this.store.deleteById(record.workspace_id);
        if (ok) purged.push(record.workspace_id);
        else failed.push(record.workspace_id);
      } catch {
        failed.push(record.workspace_id);
      }
    }
    return { purged, failed };
  }

  /** Test helper: direct store access is not exposed on public API. */
  getStoreForTests(): WorkspaceStore {
    return this.store;
  }
}
