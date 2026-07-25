import { createHash, randomUUID } from "node:crypto";
import type { AnalysisResult, PortfolioSnapshot } from "../contracts/index.js";
import {
  ATLAS_CARD_SCHEMA_VERSION,
  type AtlasAppearance,
  type AtlasCandidate,
  type AtlasCandidateGenerator,
  type AtlasCardDetail,
  type AtlasCardKind,
  type AtlasCardV1,
  type AtlasEncounter,
  type AtlasOutcome,
  type AtlasStore,
  type StoredAtlasCard,
  type StoredAtlasOutcome,
} from "./types.js";
import { decideAtlasDuplicate, normalizeAtlasText, validateAtlasCandidate } from "./validation.js";

export const ATLAS_DEADLINE_MS = 15_000;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function selectAtlasKind(analysisId: string): AtlasCardKind {
  return digest(`${analysisId}:kind`).readUInt32BE(0) % 2 === 0 ? "professional_term" : "meme";
}

export function selectAtlasAppearance(analysisId: string, canonicalKey: string): AtlasAppearance {
  const percentile = digest(`${analysisId}:${canonicalKey}:appearance`).readUInt32BE(0) % 100;
  if (percentile < 70) return "regular";
  if (percentile < 95) return "holographic";
  return "collector";
}

function visualSeed(analysisId: string, canonicalKey: string): string {
  return digest(`${analysisId}:${canonicalKey}:visual`).toString("hex").slice(0, 32);
}

function canonicalKey(candidate: AtlasCandidate): string {
  return `${candidate.kind}:${normalizeAtlasText(candidate.canonical_name)}`;
}

function encounterFor(
  candidate: AtlasCandidate,
  cardId: string,
  analysisId: string,
  occurredAt: string,
): AtlasEncounter {
  return {
    encounter_id: `encounter_${digest(`${analysisId}:${cardId}`).toString("hex").slice(0, 24)}`,
    card_id: cardId,
    analysis_id: analysisId,
    history_record_id: analysisId,
    occurred_at: occurredAt,
    context_summary: candidate.kind === "professional_term" ? candidate.why_today : candidate.meme_text,
    reference_ids: candidate.kind === "professional_term" ? [...candidate.reference_ids] : [],
  };
}

function cardFor(
  candidate: AtlasCandidate,
  cardId: string,
  analysisId: string,
  discoveredAt: string,
): StoredAtlasCard["card"] {
  const key = canonicalKey(candidate);
  return {
    schema_version: ATLAS_CARD_SCHEMA_VERSION,
    card_id: cardId,
    kind: candidate.kind,
    canonical_name: candidate.canonical_name.trim(),
    aliases: [...candidate.aliases],
    domain: candidate.domain,
    scope_labels: [...candidate.scope_labels],
    appearance: selectAtlasAppearance(analysisId, key),
    visual_seed: visualSeed(analysisId, key),
    generation_mode: candidate.generation_mode,
    first_discovered_at: discoveredAt,
    last_encountered_at: discoveredAt,
    first_analysis_id: analysisId,
    first_history_record_id: analysisId,
    encounter_count: 1,
    professional: candidate.kind === "professional_term" ? {
      plain_explanation: candidate.plain_explanation,
      why_today: candidate.why_today,
      relation: candidate.relation,
      misconception: candidate.misconception,
      boundary: candidate.boundary,
      reference_ids: [...candidate.reference_ids],
    } : null,
    meme: candidate.kind === "meme" ? {
      meme_text: candidate.meme_text,
      plain_explanation: candidate.plain_explanation,
      theme: candidate.theme,
    } : null,
  };
}

export interface StartAtlasInput {
  workspaceId: string;
  analysis: AnalysisResult;
  snapshot: PortfolioSnapshot;
}

export class AtlasService {
  private readonly tasks = new Map<string, Promise<void>>();

  constructor(
    private readonly store: AtlasStore,
    private readonly generator: AtlasCandidateGenerator,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => `atlas_${randomUUID()}`,
    private readonly deadlineMs = ATLAS_DEADLINE_MS,
  ) {
    if (!Number.isInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > ATLAS_DEADLINE_MS) {
      throw new Error("invalid_atlas_deadline");
    }
  }

  async start(input: StartAtlasInput): Promise<AtlasOutcome | null> {
    if (input.analysis.status === "unavailable") return null;
    const selectedKind = selectAtlasKind(input.analysis.analysis_id);
    const createdAt = this.now().toISOString();
    const begun = await this.store.beginRun({
      workspace_id: input.workspaceId,
      analysis_id: input.analysis.analysis_id,
      selected_kind: selectedKind,
      status: "pending",
      created_at: createdAt,
    });
    if (begun.created) {
      const key = `${input.workspaceId}:${input.analysis.analysis_id}`;
      const task = this.process(input, selectedKind).finally(() => this.tasks.delete(key));
      this.tasks.set(key, task);
    }
    return this.publicOutcome(begun.outcome);
  }

  async waitForIdle(): Promise<void> {
    await Promise.allSettled([...this.tasks.values()]);
  }

  async getOutcome(workspaceId: string, analysisId: string): Promise<AtlasOutcome | null> {
    const outcome = await this.store.getOutcome(workspaceId, analysisId);
    if (!outcome) return null;
    if (outcome.card_id && outcome.status === "new_card") {
      const detail = await this.store.getCard(workspaceId, outcome.card_id);
      if (!detail) return { ...this.publicOutcome(outcome), status: "no_card", card_id: undefined, reason: "no_candidate" };
    }
    return this.publicOutcome(outcome);
  }

  listCards(workspaceId: string): Promise<AtlasCardV1[]> {
    return this.store.listCards(workspaceId);
  }

  getCard(workspaceId: string, cardId: string): Promise<AtlasCardDetail | null> {
    return this.store.getCard(workspaceId, cardId);
  }

  deleteCard(workspaceId: string, cardId: string): Promise<boolean> {
    return this.store.deleteCard(workspaceId, cardId);
  }

  eraseWorkspace(workspaceId: string): Promise<number> {
    return this.store.eraseWorkspace(workspaceId);
  }

  private publicOutcome(outcome: StoredAtlasOutcome): AtlasOutcome {
    return {
      analysis_id: outcome.analysis_id,
      selected_kind: outcome.selected_kind,
      status: outcome.status,
      created_at: outcome.created_at,
      ...(outcome.completed_at ? { completed_at: outcome.completed_at } : {}),
      ...(outcome.card_id ? { card_id: outcome.card_id } : {}),
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    };
  }

  private async process(input: StartAtlasInput, selectedKind: AtlasCardKind): Promise<void> {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = Symbol("atlas_timeout");
    try {
      const existing = await this.store.listCards(input.workspaceId);
      const generation = this.generator.generate({
          analysis: input.analysis,
          existing_cards: existing,
          snapshot: input.snapshot,
          selected_kind: selectedKind,
        }, controller.signal);
      const raw = await Promise.race([
        generation,
        new Promise<typeof timeout>((resolve) => {
          timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
            resolve(timeout);
          }, this.deadlineMs);
        }),
      ]);
      if (raw === timeout) {
        await this.finishWithoutCard(input, "timeout", "failed");
        return;
      }
      if (controller.signal.aborted) {
        await this.finishWithoutCard(input, timedOut ? "timeout" : "generation_failed", "failed");
        return;
      }
      if (raw === null) {
        await this.finishWithoutCard(input, "no_candidate", "no_card");
        return;
      }
      if (!validateAtlasCandidate(raw, selectedKind, input.analysis)) {
        await this.finishWithoutCard(input, "invalid_candidate", "no_card");
        return;
      }
      const candidate = structuredClone(raw);
      const duplicate = decideAtlasDuplicate(candidate, existing);
      const occurredAt = this.now().toISOString();
      if (duplicate.kind === "uncertain") {
        await this.finishWithoutCard(input, "dedupe_uncertain", "no_card", occurredAt);
        return;
      }
      if (duplicate.kind === "same") {
        const result = await this.store.addEncounter(
          input.workspaceId,
          duplicate.card.card_id,
          encounterFor(candidate, duplicate.card.card_id, input.analysis.analysis_id, occurredAt),
          input.analysis.analysis_id,
        );
        if (result !== "committed" && result !== "workspace_erased") {
          await this.finishWithoutCard(input, "storage_failed", "failed", occurredAt);
        }
        return;
      }
      const cardId = this.createId();
      const card = cardFor(candidate, cardId, input.analysis.analysis_id, occurredAt);
      const result = await this.store.createCard(
        { workspace_id: input.workspaceId, canonical_key: canonicalKey(candidate), card },
        encounterFor(candidate, cardId, input.analysis.analysis_id, occurredAt),
        input.analysis.analysis_id,
      );
      if (result !== "committed" && result !== "workspace_erased") {
        await this.finishWithoutCard(input, "storage_failed", "failed", occurredAt);
      }
    } catch {
      await this.finishWithoutCard(input, timedOut ? "timeout" : "generation_failed", "failed");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async finishWithoutCard(
    input: StartAtlasInput,
    reason: NonNullable<AtlasOutcome["reason"]>,
    status: "no_card" | "failed",
    completedAt = this.now().toISOString(),
  ): Promise<void> {
    try {
      await this.store.completeRun(input.workspaceId, input.analysis.analysis_id, {
        status,
        completed_at: completedAt,
        reason,
      });
    } catch {
      // A deleted workspace or unavailable store cannot change the saved review.
    }
  }
}
