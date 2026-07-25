CREATE TABLE atlas_run_cards (
  workspace_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('new_card', 'encountered')),
  PRIMARY KEY (workspace_id, analysis_id, card_id),
  FOREIGN KEY (workspace_id, analysis_id)
    REFERENCES atlas_runs(workspace_id, analysis_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, card_id)
    REFERENCES atlas_cards(workspace_id, card_id) ON DELETE CASCADE
) STRICT;

INSERT INTO atlas_run_cards (workspace_id, analysis_id, card_id, disposition)
SELECT workspace_id, analysis_id, card_id, status
FROM atlas_runs
WHERE card_id IS NOT NULL AND status IN ('new_card', 'encountered');

DROP INDEX atlas_encounters_timeline_idx;
ALTER TABLE atlas_encounters RENAME TO atlas_encounters_single;

CREATE TABLE atlas_encounters (
  workspace_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  history_record_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  encounter_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, card_id, encounter_id),
  UNIQUE (workspace_id, analysis_id, card_id),
  FOREIGN KEY (workspace_id, card_id)
    REFERENCES atlas_cards(workspace_id, card_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, analysis_id)
    REFERENCES history_records(workspace_id, analysis_id) ON DELETE CASCADE
) STRICT;

INSERT INTO atlas_encounters (
  workspace_id, card_id, encounter_id, analysis_id,
  history_record_id, occurred_at, encounter_json
)
SELECT
  workspace_id, card_id, encounter_id, analysis_id,
  history_record_id, occurred_at, encounter_json
FROM atlas_encounters_single;

DROP TABLE atlas_encounters_single;

CREATE INDEX atlas_encounters_timeline_idx
  ON atlas_encounters (workspace_id, card_id, occurred_at, encounter_id);
