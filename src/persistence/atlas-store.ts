import type {
  AtlasCardCommitResult,
  AtlasCardDetail,
  AtlasCardV1,
  AtlasEncounter,
  AtlasStore,
  StoredAtlasCard,
  StoredAtlasOutcome,
} from "../atlas/index.js";
import type { SqliteDatabase } from "./database.js";

interface OutcomeRow {
  workspace_id: string;
  analysis_id: string;
  selected_kind: StoredAtlasOutcome["selected_kind"];
  status: StoredAtlasOutcome["status"];
  created_at: string;
  completed_at: string | null;
  card_id: string | null;
  reason: StoredAtlasOutcome["reason"] | null;
}

interface CardRow {
  card_json: string;
}

interface EncounterRow {
  encounter_json: string;
}

function outcomeFromRow(row: OutcomeRow): StoredAtlasOutcome {
  return {
    workspace_id: row.workspace_id,
    analysis_id: row.analysis_id,
    selected_kind: row.selected_kind,
    status: row.status,
    created_at: row.created_at,
    ...(row.completed_at ? { completed_at: row.completed_at } : {}),
    ...(row.card_id ? { card_id: row.card_id } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
  };
}

export class SqliteAtlasStore implements AtlasStore {
  constructor(private readonly database: SqliteDatabase) {}

  async beginRun(outcome: StoredAtlasOutcome): Promise<{ created: boolean; outcome: StoredAtlasOutcome }> {
    return this.database.transaction(() => {
      const existing = this.selectOutcome(outcome.workspace_id, outcome.analysis_id);
      if (existing) return { created: false, outcome: outcomeFromRow(existing) };
      this.database.prepare(`
        INSERT INTO atlas_runs (
          workspace_id, analysis_id, selected_kind, status, created_at,
          completed_at, card_id, reason
        ) VALUES (?, ?, ?, 'pending', ?, NULL, NULL, NULL)
      `).run(outcome.workspace_id, outcome.analysis_id, outcome.selected_kind, outcome.created_at);
      return { created: true, outcome };
    });
  }

  async completeRun(
    workspaceId: string,
    analysisId: string,
    update: Pick<StoredAtlasOutcome, "status" | "completed_at" | "reason">,
  ): Promise<boolean> {
    return this.database.transaction(() => {
      const result = this.database.prepare(`
        UPDATE atlas_runs SET status = ?, completed_at = ?, reason = ?, card_id = NULL
        WHERE workspace_id = ? AND analysis_id = ? AND status = 'pending'
      `).run(update.status, update.completed_at ?? null, update.reason ?? null, workspaceId, analysisId);
      return Number(result.changes) === 1;
    });
  }

  async createCard(
    record: StoredAtlasCard,
    encounter: AtlasEncounter,
    analysisId: string,
  ): Promise<AtlasCardCommitResult> {
    return this.database.transaction(() => {
      if (!this.pending(record.workspace_id, analysisId)) return "run_closed";
      const duplicate = this.database.prepare(`
        SELECT 1 AS present FROM atlas_cards WHERE workspace_id = ? AND canonical_key = ?
      `).get(record.workspace_id, record.canonical_key);
      if (duplicate) return "conflict";
      const workspace = this.database.prepare(
        "SELECT 1 AS present FROM workspaces WHERE workspace_id = ?",
      ).get(record.workspace_id);
      if (!workspace) return "workspace_erased";
      this.database.prepare(`
        INSERT INTO atlas_cards (
          workspace_id, card_id, canonical_key, first_discovered_at,
          last_encountered_at, card_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        record.workspace_id,
        record.card.card_id,
        record.canonical_key,
        record.card.first_discovered_at,
        record.card.last_encountered_at,
        JSON.stringify(record.card),
      );
      this.insertEncounter(record.workspace_id, encounter);
      this.database.prepare(`
        UPDATE atlas_runs SET status = 'new_card', completed_at = ?, card_id = ?, reason = NULL
        WHERE workspace_id = ? AND analysis_id = ? AND status = 'pending'
      `).run(encounter.occurred_at, record.card.card_id, record.workspace_id, analysisId);
      return "committed";
    });
  }

  async addEncounter(
    workspaceId: string,
    cardId: string,
    encounter: AtlasEncounter,
    analysisId: string,
  ): Promise<AtlasCardCommitResult> {
    return this.database.transaction(() => {
      if (!this.pending(workspaceId, analysisId)) return "run_closed";
      const row = this.database.prepare(`
        SELECT card_json FROM atlas_cards WHERE workspace_id = ? AND card_id = ?
      `).get(workspaceId, cardId) as CardRow | undefined;
      if (!row) return "conflict";
      const card = JSON.parse(row.card_json) as AtlasCardV1;
      const existing = this.database.prepare(`
        SELECT 1 AS present FROM atlas_encounters WHERE workspace_id = ? AND analysis_id = ?
      `).get(workspaceId, analysisId);
      if (!existing) this.insertEncounter(workspaceId, encounter);
      const count = this.database.prepare(`
        SELECT COUNT(*) AS count FROM atlas_encounters WHERE workspace_id = ? AND card_id = ?
      `).get(workspaceId, cardId) as { count: number | bigint };
      card.encounter_count = Number(count.count);
      card.last_encountered_at = encounter.occurred_at;
      this.database.prepare(`
        UPDATE atlas_cards SET last_encountered_at = ?, card_json = ?
        WHERE workspace_id = ? AND card_id = ?
      `).run(encounter.occurred_at, JSON.stringify(card), workspaceId, cardId);
      this.database.prepare(`
        UPDATE atlas_runs SET status = 'encountered', completed_at = ?, card_id = ?, reason = NULL
        WHERE workspace_id = ? AND analysis_id = ? AND status = 'pending'
      `).run(encounter.occurred_at, cardId, workspaceId, analysisId);
      return "committed";
    });
  }

  async getOutcome(workspaceId: string, analysisId: string): Promise<StoredAtlasOutcome | null> {
    return this.database.read(() => {
      const row = this.selectOutcome(workspaceId, analysisId);
      return row ? outcomeFromRow(row) : null;
    });
  }

  async listCards(workspaceId: string): Promise<AtlasCardV1[]> {
    return this.database.read(() => {
      const rows = this.database.prepare(`
        SELECT card_json FROM atlas_cards WHERE workspace_id = ?
        ORDER BY first_discovered_at DESC, card_id
      `).all(workspaceId) as unknown as CardRow[];
      return rows.map((row) => JSON.parse(row.card_json) as AtlasCardV1);
    });
  }

  async getCard(workspaceId: string, cardId: string): Promise<AtlasCardDetail | null> {
    return this.database.read(() => {
      const row = this.database.prepare(`
        SELECT card_json FROM atlas_cards WHERE workspace_id = ? AND card_id = ?
      `).get(workspaceId, cardId) as CardRow | undefined;
      if (!row) return null;
      const encounters = this.database.prepare(`
        SELECT encounter_json FROM atlas_encounters
        WHERE workspace_id = ? AND card_id = ?
        ORDER BY occurred_at, encounter_id
      `).all(workspaceId, cardId) as unknown as EncounterRow[];
      return {
        card: JSON.parse(row.card_json) as AtlasCardV1,
        encounters: encounters.map((item) => JSON.parse(item.encounter_json) as AtlasEncounter),
      };
    });
  }

  async deleteCard(workspaceId: string, cardId: string): Promise<boolean> {
    return this.database.transaction(() => {
      const result = this.database.prepare(
        "DELETE FROM atlas_cards WHERE workspace_id = ? AND card_id = ?",
      ).run(workspaceId, cardId);
      if (Number(result.changes) === 1) {
        this.database.prepare(`
          UPDATE atlas_runs SET status = 'no_card', card_id = NULL, reason = 'card_deleted'
          WHERE workspace_id = ? AND card_id = ?
        `).run(workspaceId, cardId);
      }
      return Number(result.changes) === 1;
    });
  }

  async eraseWorkspace(workspaceId: string): Promise<number> {
    return this.database.transaction(() => {
      const count = this.database.prepare(`
        SELECT COUNT(*) AS count FROM atlas_cards WHERE workspace_id = ?
      `).get(workspaceId) as { count: number | bigint };
      this.database.prepare("DELETE FROM atlas_runs WHERE workspace_id = ?").run(workspaceId);
      this.database.prepare("DELETE FROM atlas_cards WHERE workspace_id = ?").run(workspaceId);
      return Number(count.count);
    });
  }

  private selectOutcome(workspaceId: string, analysisId: string): OutcomeRow | undefined {
    return this.database.prepare(`
      SELECT workspace_id, analysis_id, selected_kind, status, created_at,
        completed_at, card_id, reason
      FROM atlas_runs WHERE workspace_id = ? AND analysis_id = ?
    `).get(workspaceId, analysisId) as OutcomeRow | undefined;
  }

  private pending(workspaceId: string, analysisId: string): boolean {
    return Boolean(this.database.prepare(`
      SELECT 1 AS present FROM atlas_runs
      WHERE workspace_id = ? AND analysis_id = ? AND status = 'pending'
    `).get(workspaceId, analysisId));
  }

  private insertEncounter(workspaceId: string, encounter: AtlasEncounter): void {
    this.database.prepare(`
      INSERT INTO atlas_encounters (
        workspace_id, card_id, encounter_id, analysis_id,
        history_record_id, occurred_at, encounter_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspaceId,
      encounter.card_id,
      encounter.encounter_id,
      encounter.analysis_id,
      encounter.history_record_id,
      encounter.occurred_at,
      JSON.stringify(encounter),
    );
  }
}
