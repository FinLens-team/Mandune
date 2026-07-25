import type {
  AtlasCardCommitResult,
  AtlasCardDetail,
  AtlasCardV1,
  AtlasEncounter,
  AtlasStore,
  StoredAtlasCard,
  StoredAtlasOutcome,
} from "./types.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryAtlasStore implements AtlasStore {
  private readonly outcomes = new Map<string, Map<string, StoredAtlasOutcome>>();
  private readonly cards = new Map<string, Map<string, StoredAtlasCard>>();
  private readonly encounters = new Map<string, Map<string, AtlasEncounter[]>>();
  private readonly erased = new Set<string>();

  async beginRun(outcome: StoredAtlasOutcome): Promise<{ created: boolean; outcome: StoredAtlasOutcome }> {
    if (this.erased.has(outcome.workspace_id)) throw new Error("workspace_erased");
    const byAnalysis = this.outcomes.get(outcome.workspace_id) ?? new Map<string, StoredAtlasOutcome>();
    const existing = byAnalysis.get(outcome.analysis_id);
    if (existing) return { created: false, outcome: clone(existing) };
    byAnalysis.set(outcome.analysis_id, clone(outcome));
    this.outcomes.set(outcome.workspace_id, byAnalysis);
    return { created: true, outcome: clone(outcome) };
  }

  async completeRun(
    workspaceId: string,
    analysisId: string,
    update: Pick<StoredAtlasOutcome, "status" | "completed_at" | "reason">,
  ): Promise<boolean> {
    if (this.erased.has(workspaceId)) return false;
    const outcome = this.outcomes.get(workspaceId)?.get(analysisId);
    if (!outcome || outcome.status !== "pending") return false;
    Object.assign(outcome, clone(update));
    const first = outcome.cards?.[0];
    outcome.card_id = first?.card_id;
    return true;
  }

  async createCard(
    record: StoredAtlasCard,
    encounter: AtlasEncounter,
    analysisId: string,
  ): Promise<AtlasCardCommitResult> {
    if (this.erased.has(record.workspace_id)) return "workspace_erased";
    const outcome = this.outcomes.get(record.workspace_id)?.get(analysisId);
    if (!outcome || outcome.status !== "pending") return "run_closed";
    const byId = this.cards.get(record.workspace_id) ?? new Map<string, StoredAtlasCard>();
    if ([...byId.values()].some((item) => item.canonical_key === record.canonical_key)) return "conflict";
    byId.set(record.card.card_id, clone(record));
    this.cards.set(record.workspace_id, byId);
    const byCard = this.encounters.get(record.workspace_id) ?? new Map<string, AtlasEncounter[]>();
    byCard.set(record.card.card_id, [clone(encounter)]);
    this.encounters.set(record.workspace_id, byCard);
    outcome.cards = [...(outcome.cards ?? []), { card_id: record.card.card_id, disposition: "new_card" }];
    return "committed";
  }

  async addEncounter(
    workspaceId: string,
    cardId: string,
    encounter: AtlasEncounter,
    analysisId: string,
  ): Promise<AtlasCardCommitResult> {
    if (this.erased.has(workspaceId)) return "workspace_erased";
    const outcome = this.outcomes.get(workspaceId)?.get(analysisId);
    const stored = this.cards.get(workspaceId)?.get(cardId);
    if (!outcome || outcome.status !== "pending") return "run_closed";
    if (!stored) return "conflict";
    if (outcome.cards?.some((item) => item.card_id === cardId)) return "committed";
    const byCard = this.encounters.get(workspaceId) ?? new Map<string, AtlasEncounter[]>();
    const list = byCard.get(cardId) ?? [];
    if (!list.some((item) => item.analysis_id === analysisId)) list.push(clone(encounter));
    byCard.set(cardId, list);
    this.encounters.set(workspaceId, byCard);
    stored.card.encounter_count = list.length;
    stored.card.last_encountered_at = encounter.occurred_at;
    outcome.cards = [...(outcome.cards ?? []), { card_id: cardId, disposition: "encountered" }];
    return "committed";
  }

  async getOutcome(workspaceId: string, analysisId: string): Promise<StoredAtlasOutcome | null> {
    const outcome = this.outcomes.get(workspaceId)?.get(analysisId);
    return outcome ? clone(outcome) : null;
  }

  async listCards(workspaceId: string): Promise<AtlasCardV1[]> {
    return [...(this.cards.get(workspaceId)?.values() ?? [])]
      .map((record) => clone(record.card))
      .sort((left, right) => right.first_discovered_at.localeCompare(left.first_discovered_at));
  }

  async getCard(workspaceId: string, cardId: string): Promise<AtlasCardDetail | null> {
    const record = this.cards.get(workspaceId)?.get(cardId);
    if (!record) return null;
    const encounters = clone(this.encounters.get(workspaceId)?.get(cardId) ?? [])
      .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
    return { card: clone(record.card), encounters };
  }

  async deleteCard(workspaceId: string, cardId: string): Promise<boolean> {
    const deleted = this.cards.get(workspaceId)?.delete(cardId) ?? false;
    this.encounters.get(workspaceId)?.delete(cardId);
    if (deleted) {
      for (const outcome of this.outcomes.get(workspaceId)?.values() ?? []) {
        if (!outcome.cards?.some((item) => item.card_id === cardId) && outcome.card_id !== cardId) continue;
        outcome.cards = outcome.cards?.filter((item) => item.card_id !== cardId);
        outcome.card_id = outcome.cards?.[0]?.card_id;
        if (!outcome.card_id) {
          outcome.status = "no_card";
          outcome.reason = "card_deleted";
        } else {
          outcome.status = outcome.cards?.some((item) => item.disposition === "new_card")
            ? "new_card"
            : "encountered";
          outcome.reason = undefined;
        }
      }
    }
    return deleted;
  }

  async eraseWorkspace(workspaceId: string): Promise<number> {
    const count = this.cards.get(workspaceId)?.size ?? 0;
    this.erased.add(workspaceId);
    this.cards.delete(workspaceId);
    this.encounters.delete(workspaceId);
    this.outcomes.delete(workspaceId);
    return count;
  }
}
