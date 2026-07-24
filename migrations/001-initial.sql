CREATE TABLE workspaces (
  workspace_id TEXT PRIMARY KEY,
  locator TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;

CREATE INDEX workspaces_expires_at_idx ON workspaces (expires_at);

CREATE TABLE workspace_tombstones (
  workspace_id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
) STRICT;

CREATE TABLE history_records (
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  record_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  analysis_completed_at TEXT NOT NULL,
  evidence_cutoff_at TEXT NOT NULL,
  result_status TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  history_schema_version TEXT NOT NULL,
  contracts_version TEXT NOT NULL,
  rational_analysis_version TEXT NOT NULL,
  theme_narrative_version TEXT,
  envelope_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, record_id),
  UNIQUE (workspace_id, analysis_id)
) STRICT;

CREATE INDEX history_records_list_idx
  ON history_records (workspace_id, analysis_completed_at DESC, analysis_id);
