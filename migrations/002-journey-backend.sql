CREATE TABLE current_drafts (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  draft_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE analysis_runs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  analysis_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'terminal')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  terminal_reason TEXT,
  retryable INTEGER NOT NULL DEFAULT 0 CHECK (retryable IN (0, 1)),
  execution_json TEXT,
  PRIMARY KEY (workspace_id, analysis_id)
) STRICT;

CREATE UNIQUE INDEX analysis_runs_one_active_idx
  ON analysis_runs (workspace_id)
  WHERE state IN ('queued', 'running');

CREATE INDEX analysis_runs_lookup_idx
  ON analysis_runs (workspace_id, created_at DESC, analysis_id);

CREATE TABLE analysis_events (
  workspace_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, analysis_id, sequence),
  UNIQUE (workspace_id, analysis_id, event_json),
  FOREIGN KEY (workspace_id, analysis_id)
    REFERENCES analysis_runs(workspace_id, analysis_id) ON DELETE CASCADE
) STRICT;
