CREATE TABLE atlas_runs (
  workspace_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  selected_kind TEXT NOT NULL CHECK (selected_kind IN ('professional_term', 'meme')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'new_card', 'encountered', 'no_card', 'failed')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  card_id TEXT,
  reason TEXT,
  PRIMARY KEY (workspace_id, analysis_id),
  FOREIGN KEY (workspace_id, analysis_id)
    REFERENCES history_records(workspace_id, analysis_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE atlas_cards (
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  first_discovered_at TEXT NOT NULL,
  last_encountered_at TEXT NOT NULL,
  card_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, card_id),
  UNIQUE (workspace_id, canonical_key)
) STRICT;

CREATE INDEX atlas_cards_wall_idx
  ON atlas_cards (workspace_id, first_discovered_at DESC, card_id);

CREATE TABLE atlas_encounters (
  workspace_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  history_record_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  encounter_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, card_id, encounter_id),
  UNIQUE (workspace_id, analysis_id),
  FOREIGN KEY (workspace_id, card_id)
    REFERENCES atlas_cards(workspace_id, card_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, analysis_id)
    REFERENCES history_records(workspace_id, analysis_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX atlas_encounters_timeline_idx
  ON atlas_encounters (workspace_id, card_id, occurred_at, encounter_id);
