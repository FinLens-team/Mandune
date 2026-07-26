CREATE TABLE daily_metrics (
  date TEXT PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
  workspace_creations INTEGER NOT NULL DEFAULT 0 CHECK (workspace_creations >= 0),
  review_starts INTEGER NOT NULL DEFAULT 0 CHECK (review_starts >= 0),
  updated_at TEXT
) STRICT;
