export const WORKSPACE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const WORKSPACE_COOKIE = "md_workspace";

export interface WorkspaceRecord {
  /** Internal stable id — never put in URLs as the only secret. */
  workspace_id: string;
  /** Opaque locator presented to the client (cookie value). */
  locator: string;
  created_at: string;
  last_active_at: string;
  expires_at: string;
  deleted_at?: string;
}

export interface WorkspacePublicStatus {
  workspace_id: string;
  last_active_at: string;
  expires_at: string;
  ttl_days: 30;
}

export interface WorkspaceDeleteResult {
  workspace_id: string;
  deleted_at: string;
  /** Cascade hook for history/portfolio stores owned by later tickets. */
  cascade: {
    portfolio: true;
    analysis_history: true;
  };
}
