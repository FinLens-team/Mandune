import { describe, expect, it, vi } from "vitest";
import {
  ATLAS_GENERATION_POLICY_VERSION,
  ATLAS_CANDIDATE_SCHEMA_VERSION,
  AtlasService,
  includeAtlasMeme,
  MemoryAtlasStore,
  ModelAtlasCandidateGenerator,
  decideAtlasDuplicate,
  selectAtlasAppearance,
  selectAtlasKind,
  type AtlasCandidate,
  type AtlasCandidateGenerator,
  type AtlasGenerationInput,
  type AtlasCardV1,
} from "../../src/atlas/index.js";
import { getFixture } from "../../src/fixtures/index.js";
import type { ModelGateway, ModelGatewayRequest } from "../../src/model/index.js";

function analysis(analysisId: string, status = getFixture("supported_full").analysis.status) {
  return {
    ...structuredClone(getFixture("supported_full").analysis),
    analysis_id: analysisId,
    status,
  };
}

function candidateFor(input: AtlasGenerationInput, name = "组合集中度"): AtlasCandidate {
  if (input.selected_kind === "meme") {
    return {
      schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
      kind: "meme",
      canonical_name: name,
      aliases: [],
      scope_labels: [],
      generation_mode: "fixture",
      domain: null,
      meme_text: `${name}，先看懂再激动。`,
      plain_explanation: "提醒自己先理解今天的复盘。",
      theme: "测试梗",
    };
  }
  return {
    schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
    kind: "professional_term",
    canonical_name: name,
    aliases: name === "组合集中度" ? ["持仓集中度"] : [],
    scope_labels: ["示例组合"],
    generation_mode: "fixture",
    domain: "portfolio",
    plain_explanation: "资金或风险是否集中在少数持仓。",
    why_today: "本次复盘用它解释组合对少数方向的敏感性。",
    relation: "它对应本次已经保存的组合观察。",
    misconception: "集中不等于一定亏损。",
    boundary: "它不能预测未来涨跌。",
    reference_ids: input.analysis.conclusions[0]?.refs.map((ref) => ref.ref_id) ?? [],
  };
}

function idFor(kind: ReturnType<typeof selectAtlasKind>, suffix: string): string {
  for (let index = 0; index < 10_000; index += 1) {
    const value = `analysis-${suffix}-${index}`;
    if (selectAtlasKind(value) === kind) return value;
  }
  throw new Error(`No deterministic id found for ${kind}.`);
}

describe("atlas deterministic selection", () => {
  it("keeps kind and appearance stable with the intended distributions", () => {
    const kindCounts = { professional_term: 0, meme: 0 };
    const appearanceCounts = { regular: 0, holographic: 0, collector: 0 };
    let memeIncluded = 0;

    for (let index = 0; index < 10_000; index += 1) {
      const analysisId = `analysis-distribution-${index}`;
      const kind = selectAtlasKind(analysisId);
      const appearance = selectAtlasAppearance(analysisId, `key-${index}`);
      kindCounts[kind] += 1;
      appearanceCounts[appearance] += 1;
      if (includeAtlasMeme(analysisId)) memeIncluded += 1;
      expect(selectAtlasKind(analysisId)).toBe(kind);
      expect(selectAtlasAppearance(analysisId, `key-${index}`)).toBe(appearance);
    }

    expect(kindCounts.professional_term / 10_000).toBeGreaterThan(0.47);
    expect(kindCounts.professional_term / 10_000).toBeLessThan(0.53);
    expect(appearanceCounts.regular / 10_000).toBeGreaterThan(0.67);
    expect(appearanceCounts.regular / 10_000).toBeLessThan(0.73);
    expect(appearanceCounts.holographic / 10_000).toBeGreaterThan(0.22);
    expect(appearanceCounts.holographic / 10_000).toBeLessThan(0.28);
    expect(appearanceCounts.collector / 10_000).toBeGreaterThan(0.035);
    expect(appearanceCounts.collector / 10_000).toBeLessThan(0.065);
    expect(memeIncluded / 10_000).toBeGreaterThan(0.32);
    expect(memeIncluded / 10_000).toBeLessThan(0.38);
  });
});

describe("atlas service boundaries", () => {
  it("persists up to three professional cards plus one optional meme for one analysis", async () => {
    const store = new MemoryAtlasStore();
    const service = new AtlasService(
      store,
      { generate: async () => null },
      () => new Date("2026-07-25T08:00:00.000Z"),
      (() => { let id = 0; return () => `card-multi-${++id}`; })(),
    );
    let analysisId = "";
    for (let index = 0; index < 10_000; index += 1) {
      const candidate = `analysis-multi-${index}`;
      if (selectAtlasKind(candidate) === "professional_term") {
        analysisId = candidate;
        break;
      }
    }
    const currentAnalysis = analysis(analysisId);
    const snapshot = structuredClone(getFixture("supported_full").snapshot);
    const candidates = ["组合集中度", "流动性缓冲", "风险暴露"].map((name) => {
      const value = candidateFor({
        analysis: currentAnalysis,
        existing_cards: [],
        snapshot,
        selected_kind: "professional_term",
      }, name);
      if (value.kind === "professional_term") value.reference_ids = ["review-packet-fact"];
      return value;
    });

    await service.consume({
      workspaceId: "workspace-multi",
      analysis: currentAnalysis,
      snapshot,
      candidates,
      allowed_reference_ids: ["review-packet-fact"],
      reportMarkdown: "本次报告涉及组合集中度、流动性缓冲和风险暴露。",
    });
    await service.waitForIdle();

    expect(await service.listCards("workspace-multi")).toHaveLength(3);
    expect(await service.getOutcome("workspace-multi", analysisId)).toMatchObject({
      status: "new_card",
      cards: [
        { disposition: "new_card" },
        { disposition: "new_card" },
        { disposition: "new_card" },
      ],
    });
  });

  it("creates at most one card and turns a repeated concept into a silent encounter", async () => {
    const store = new MemoryAtlasStore();
    const generator: AtlasCandidateGenerator = {
      generate: async (input) => candidateFor(input),
    };
    let cardCounter = 0;
    let clockCounter = 0;
    const service = new AtlasService(
      store,
      generator,
      () => new Date(Date.UTC(2026, 6, 25, 8, 0, clockCounter++)),
      () => `card-${++cardCounter}`,
    );
    const firstId = idFor("professional_term", "first");
    const secondId = idFor("professional_term", "second");
    const snapshot = structuredClone(getFixture("supported_full").snapshot);

    await service.start({ workspaceId: "workspace-a", analysis: analysis(firstId), snapshot });
    await service.waitForIdle();
    await service.start({ workspaceId: "workspace-a", analysis: analysis(secondId), snapshot });
    await service.waitForIdle();

    expect(await service.getOutcome("workspace-a", firstId)).toMatchObject({ status: "new_card" });
    expect(await service.getOutcome("workspace-a", secondId)).toMatchObject({ status: "encountered" });
    const cards = await service.listCards("workspace-a");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      canonical_name: "组合集中度",
      encounter_count: 2,
      first_analysis_id: firstId,
    });
    const detail = await service.getCard("workspace-a", cards[0]!.card_id);
    expect(detail?.encounters.map((item) => item.analysis_id)).toEqual([firstId, secondId]);
  });

  it("recomputes a multi-card outcome after one card is deleted", async () => {
    const store = new MemoryAtlasStore();
    let cardCounter = 0;
    const service = new AtlasService(
      store,
      { generate: async () => null },
      () => new Date("2026-07-25T08:00:00.000Z"),
      () => `card-delete-${++cardCounter}`,
    );
    const snapshot = structuredClone(getFixture("supported_full").snapshot);
    const firstId = idFor("professional_term", "delete-first");
    const secondId = idFor("professional_term", "delete-second");
    const firstAnalysis = analysis(firstId);
    const secondAnalysis = analysis(secondId);
    const firstCandidate = candidateFor({
      analysis: firstAnalysis,
      existing_cards: [],
      snapshot,
      selected_kind: "professional_term",
    });
    const repeatedCandidate = candidateFor({
      analysis: secondAnalysis,
      existing_cards: [],
      snapshot,
      selected_kind: "professional_term",
    });
    const newCandidate = candidateFor({
      analysis: secondAnalysis,
      existing_cards: [],
      snapshot,
      selected_kind: "professional_term",
    }, "风险暴露");

    await service.consume({
      workspaceId: "workspace-delete",
      analysis: firstAnalysis,
      snapshot,
      candidates: [firstCandidate],
      allowed_reference_ids: [],
      reportMarkdown: "组合集中度。",
    });
    await service.waitForIdle();
    await service.consume({
      workspaceId: "workspace-delete",
      analysis: secondAnalysis,
      snapshot,
      candidates: [repeatedCandidate, newCandidate],
      allowed_reference_ids: [],
      reportMarkdown: "组合集中度与风险暴露。",
    });
    await service.waitForIdle();

    const cards = await service.listCards("workspace-delete");
    const newCard = cards.find((card) => card.canonical_name === "风险暴露");
    expect(newCard).toBeDefined();
    expect(await service.deleteCard("workspace-delete", newCard!.card_id)).toBe(true);
    expect(await service.getOutcome("workspace-delete", secondId)).toMatchObject({
      status: "encountered",
      cards: [{ disposition: "encountered" }],
    });
  });

  it("does not create a card when semantic dedupe is uncertain", async () => {
    const existing: AtlasCardV1 = {
      schema_version: "atlas-card.v1",
      card_id: "card-existing",
      kind: "professional_term",
      canonical_name: "组合集中度",
      aliases: [],
      domain: "portfolio",
      scope_labels: [],
      appearance: "regular",
      visual_seed: "1234567890abcdef",
      generation_mode: "fixture",
      first_discovered_at: "2026-07-25T08:00:00.000Z",
      last_encountered_at: "2026-07-25T08:00:00.000Z",
      first_analysis_id: "analysis-existing",
      first_history_record_id: "analysis-existing",
      encounter_count: 1,
      meme: null,
      professional: {
        plain_explanation: "资金是否集中在少数持仓。",
        why_today: "今天遇见。",
        relation: "与组合有关。",
        misconception: "不等于必然亏损。",
        boundary: "不能预测涨跌。",
        reference_ids: ["ev-etf-close"],
      },
    };
    const uncertain = candidateFor({
      analysis: analysis("analysis-uncertain"),
      existing_cards: [existing],
      snapshot: structuredClone(getFixture("supported_full").snapshot),
      selected_kind: "professional_term",
    }, "组合集中风险");
    expect(decideAtlasDuplicate(uncertain, [existing])).toEqual({ kind: "uncertain" });
  });

  it("gives the model a compact existing-card index and versioned generation policy", async () => {
    let request: ModelGatewayRequest | undefined;
    const gateway: ModelGateway = {
      async generate<T>(next: ModelGatewayRequest) {
        request = next;
        return { ok: true, value: candidateFor({
          analysis: analysis("analysis-model-policy"),
          existing_cards: [],
          snapshot: structuredClone(getFixture("supported_full").snapshot),
          selected_kind: "professional_term",
        }) as T };
      },
    };
    const existing = candidateFor({
      analysis: analysis("analysis-existing-policy"),
      existing_cards: [],
      snapshot: structuredClone(getFixture("supported_full").snapshot),
      selected_kind: "professional_term",
    });
    const existingCard: AtlasCardV1 = {
      schema_version: "atlas-card.v1",
      card_id: "card-policy-existing",
      kind: "professional_term",
      canonical_name: existing.canonical_name,
      aliases: existing.aliases,
      domain: "portfolio",
      scope_labels: [],
      appearance: "regular",
      visual_seed: "1234567890abcdef",
      generation_mode: "fixture",
      first_discovered_at: "2026-07-25T08:00:00.000Z",
      last_encountered_at: "2026-07-25T08:00:00.000Z",
      first_analysis_id: "analysis-existing-policy",
      first_history_record_id: "analysis-existing-policy",
      encounter_count: 1,
      professional: existing.kind === "professional_term" ? {
        plain_explanation: existing.plain_explanation,
        why_today: existing.why_today,
        relation: existing.relation,
        misconception: existing.misconception,
        boundary: existing.boundary,
        reference_ids: existing.reference_ids,
      } : null,
      meme: null,
    };

    await new ModelAtlasCandidateGenerator(gateway).generate({
      analysis: analysis("analysis-model-policy"),
      existing_cards: [existingCard],
      snapshot: structuredClone(getFixture("supported_full").snapshot),
      selected_kind: "professional_term",
    }, new AbortController().signal);

    expect(request?.instructions).toContain(ATLAS_GENERATION_POLICY_VERSION);
    expect(request?.instructions).toContain("existing_cards");
    expect(request?.input).toMatchObject({
      existing_cards: [{
        card_id: "card-policy-existing",
        canonical_name: "组合集中度",
        kind: "professional_term",
      }],
    });
    expect(JSON.stringify(request?.input)).not.toContain("why_today");
  });

  it("skips unavailable reviews and enforces a hard timeout even when generation ignores abort", async () => {
    const store = new MemoryAtlasStore();
    const slow: AtlasCandidateGenerator = {
      generate: async (input) => new Promise((resolve) => {
        setTimeout(() => resolve(candidateFor(input)), 60);
      }),
    };
    const service = new AtlasService(store, slow, undefined, undefined, 10);
    const unavailableId = "analysis-unavailable";
    const timeoutId = idFor("meme", "timeout");
    const snapshot = structuredClone(getFixture("supported_full").snapshot);

    expect(await service.start({
      workspaceId: "workspace-timeout",
      analysis: analysis(unavailableId, "unavailable"),
      snapshot,
    })).toBeNull();
    expect(await service.getOutcome("workspace-timeout", unavailableId)).toBeNull();

    await service.start({ workspaceId: "workspace-timeout", analysis: analysis(timeoutId), snapshot });
    await service.waitForIdle();
    expect(await service.getOutcome("workspace-timeout", timeoutId)).toMatchObject({
      status: "failed",
      reason: "timeout",
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await service.listCards("workspace-timeout")).toEqual([]);
  });

  it("maps deleted cards to a no-card outcome without rewriting the original analysis", async () => {
    const store = new MemoryAtlasStore();
    const service = new AtlasService(store, { generate: async (input) => candidateFor(input) });
    const analysisId = idFor("meme", "delete");
    const snapshot = structuredClone(getFixture("supported_full").snapshot);
    await service.start({ workspaceId: "workspace-delete", analysis: analysis(analysisId), snapshot });
    await service.waitForIdle();
    const card = (await service.listCards("workspace-delete"))[0]!;

    expect(await service.deleteCard("workspace-delete", card.card_id)).toBe(true);
    expect(await service.listCards("workspace-delete")).toEqual([]);
    expect(await service.getOutcome("workspace-delete", analysisId)).toMatchObject({
      status: "no_card",
      reason: "card_deleted",
    });
  });

  it("consumes the main response candidate without invoking the Atlas generator", async () => {
    const store = new MemoryAtlasStore();
    const generate = vi.fn();
    const service = new AtlasService(store, { generate });
    const analysisId = idFor("professional_term", "consume");
    const currentAnalysis = analysis(analysisId);
    const snapshot = structuredClone(getFixture("supported_full").snapshot);
    const consumed = candidateFor({
      analysis: currentAnalysis,
      existing_cards: [],
      snapshot,
      selected_kind: "professional_term",
    });
    if (consumed.kind !== "professional_term") throw new Error("unexpected_candidate_kind");
    consumed.generation_mode = "model";
    consumed.reference_ids = ["review-packet-fact"];

    await service.consume({
      workspaceId: "workspace-consume",
      analysis: currentAnalysis,
      snapshot,
      candidates: [consumed],
      allowed_reference_ids: ["review-packet-fact"],
    });
    await service.waitForIdle();

    expect(generate).not.toHaveBeenCalled();
    expect(await service.getOutcome("workspace-consume", analysisId)).toMatchObject({ status: "new_card" });
    expect(await service.listCards("workspace-consume")).toHaveLength(1);
  });

  it("records an invalid main-response Atlas subobject as no-card", async () => {
    const store = new MemoryAtlasStore();
    const generate = vi.fn();
    const service = new AtlasService(store, { generate });
    const analysisId = idFor("meme", "consume-invalid");
    const currentAnalysis = analysis(analysisId);
    const snapshot = structuredClone(getFixture("supported_full").snapshot);

    await service.consume({
      workspaceId: "workspace-consume-invalid",
      analysis: currentAnalysis,
      snapshot,
      candidates: [],
      allowed_reference_ids: [],
      invalid_candidate: true,
    });
    await service.waitForIdle();

    expect(generate).not.toHaveBeenCalled();
    expect(await service.getOutcome("workspace-consume-invalid", analysisId)).toMatchObject({
      status: "no_card",
      reason: "invalid_candidate",
    });
  });
});
