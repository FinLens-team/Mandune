import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATLAS_CANDIDATE_SCHEMA_VERSION,
  AtlasService,
  selectAtlasKind,
  type AtlasCandidateGenerator,
  type AtlasGenerationInput,
} from "../../src/atlas/index.js";
import { getFixture } from "../../src/fixtures/index.js";
import type { StoredHistoryEnvelope } from "../../src/history/index.js";
import {
  SqliteAtlasStore,
  SqliteHistoryStore,
  SqliteWorkspaceStore,
  openSqliteDatabase,
  type SqliteDatabase,
} from "../../src/persistence/index.js";
import { WorkspaceService } from "../../src/workspace/index.js";

const roots: string[] = [];
const databases: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function open(): SqliteDatabase {
  const root = mkdtempSync(path.join(tmpdir(), "mandong-atlas-"));
  roots.push(root);
  const database = openSqliteDatabase({
    dbPath: path.join(root, "mandong.sqlite3"),
    migrationsDirectory: path.resolve("migrations"),
  });
  databases.push(database);
  return database;
}

function envelope(workspaceId: string, analysisId: string): StoredHistoryEnvelope {
  const fixture = getFixture("supported_full");
  return {
    workspace_id: workspaceId,
    record_id: analysisId,
    analysis_id: analysisId,
    snapshot_id: fixture.snapshot.snapshot_id,
    analysis_completed_at: fixture.analysis.analysis_completed_at,
    evidence_cutoff_at: fixture.analysis.evidence_cutoff_at,
    result_status: fixture.analysis.status,
    theme_id: fixture.analysis.theme_id,
    versions: {
      history_schema: "analysis-history.v1",
      contracts: fixture.contracts_version,
      rational_analysis: "rational-analysis.v1",
      theme_narrative: "theme-narrative.v1",
    },
    payload_json: JSON.stringify({ fixture: true, analysis_id: analysisId }),
  };
}

function analysis(analysisId: string) {
  return { ...structuredClone(getFixture("supported_full").analysis), analysis_id: analysisId };
}

function idFor(kind: ReturnType<typeof selectAtlasKind>, suffix: string): string {
  for (let index = 0; index < 10_000; index += 1) {
    const value = `analysis-sqlite-${suffix}-${index}`;
    if (selectAtlasKind(value) === kind) return value;
  }
  throw new Error(`No id for ${kind}`);
}

function candidate(input: AtlasGenerationInput) {
  if (input.selected_kind === "meme") {
    return {
      schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
      kind: "meme" as const,
      canonical_name: "SQLite 各存各的",
      aliases: ["各存各的"],
      scope_labels: [],
      generation_mode: "fixture" as const,
      domain: null,
      meme_text: "卡归卡，历史归历史。",
      plain_explanation: "删除卡片不会改写复盘。",
      theme: "测试",
    };
  }
  return {
    schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
    kind: "professional_term" as const,
    canonical_name: "组合集中度",
    aliases: ["持仓集中度"],
    scope_labels: ["示例组合"],
    generation_mode: "fixture" as const,
    domain: "portfolio" as const,
    plain_explanation: "资金是否集中在少数持仓。",
    why_today: "本次复盘用它解释组合敏感性。",
    relation: "关联已保存的组合结论。",
    misconception: "集中不等于一定亏损。",
    boundary: "不能预测未来涨跌。",
    reference_ids: input.analysis.conclusions[0]?.refs.map((ref) => ref.ref_id) ?? [],
  };
}

const generator: AtlasCandidateGenerator = { generate: async (input) => candidate(input) };
const fence = { signal: new AbortController().signal, canCommit: () => true };

async function saveHistory(store: SqliteHistoryStore, workspaceId: string, analysisId: string) {
  expect(await store.append(envelope(workspaceId, analysisId), fence)).toBe("committed");
}

describe("SQLite atlas durability", () => {
  it("persists multiple cards and encounters for the same analysis run", async () => {
    const database = open();
    const workspaces = new WorkspaceService(new SqliteWorkspaceStore(database));
    const history = new SqliteHistoryStore(database);
    const atlas = new AtlasService(
      new SqliteAtlasStore(database),
      generator,
      () => new Date("2026-07-25T08:00:00.000Z"),
      (() => { let id = 0; return () => `sqlite-multi-card-${++id}`; })(),
    );
    const workspace = await workspaces.create();
    const analysisId = idFor("professional_term", "multi");
    const currentAnalysis = analysis(analysisId);
    const snapshot = structuredClone(getFixture("supported_full").snapshot);
    await saveHistory(history, workspace.record.workspace_id, analysisId);
    const first = candidate({
      analysis: currentAnalysis,
      existing_cards: [],
      snapshot,
      selected_kind: "professional_term",
    });
    if (first.kind !== "professional_term") throw new Error("expected_professional");
    first.reference_ids = ["multi-reference"];
    const second = { ...first, canonical_name: "风险暴露", aliases: [] };

    await atlas.consume({
      workspaceId: workspace.record.workspace_id,
      analysis: currentAnalysis,
      snapshot,
      candidates: [first, second],
      allowed_reference_ids: ["multi-reference"],
      reportMarkdown: "本次报告涉及组合集中度和风险暴露。",
    });
    await atlas.waitForIdle();

    const cards = await atlas.listCards(workspace.record.workspace_id);
    expect(cards).toHaveLength(2);
    expect(await atlas.getOutcome(workspace.record.workspace_id, analysisId)).toMatchObject({
      status: "new_card",
      cards: [{ disposition: "new_card" }, { disposition: "new_card" }],
    });
    expect(await atlas.deleteCard(workspace.record.workspace_id, cards[0]!.card_id)).toBe(true);
    expect(await atlas.getOutcome(workspace.record.workspace_id, analysisId)).toMatchObject({
      status: "new_card",
      cards: [{ card_id: cards[1]!.card_id }],
      card_id: cards[1]!.card_id,
    });
  });

  it("isolates workspaces, preserves history on card deletion, and allows later recollection", async () => {
    const database = open();
    const workspaceStore = new SqliteWorkspaceStore(database);
    const workspaces = new WorkspaceService(workspaceStore);
    const history = new SqliteHistoryStore(database);
    const atlas = new AtlasService(new SqliteAtlasStore(database), generator);
    const workspaceA = await workspaces.create();
    const workspaceB = await workspaces.create();
    const firstId = idFor("professional_term", "first");
    const secondId = idFor("professional_term", "second");
    const snapshot = structuredClone(getFixture("supported_full").snapshot);

    await saveHistory(history, workspaceA.record.workspace_id, firstId);
    await atlas.start({ workspaceId: workspaceA.record.workspace_id, analysis: analysis(firstId), snapshot });
    await atlas.waitForIdle();
    const firstCard = (await atlas.listCards(workspaceA.record.workspace_id))[0]!;
    expect(await atlas.listCards(workspaceB.record.workspace_id)).toEqual([]);
    expect(await atlas.getCard(workspaceB.record.workspace_id, firstCard.card_id)).toBeNull();

    expect(await atlas.deleteCard(workspaceA.record.workspace_id, firstCard.card_id)).toBe(true);
    expect(await history.get(workspaceA.record.workspace_id, firstId)).not.toBeNull();
    expect(await atlas.getOutcome(workspaceA.record.workspace_id, firstId)).toMatchObject({
      status: "no_card",
      reason: "card_deleted",
    });

    await saveHistory(history, workspaceA.record.workspace_id, secondId);
    await atlas.start({ workspaceId: workspaceA.record.workspace_id, analysis: analysis(secondId), snapshot });
    await atlas.waitForIdle();
    const recollected = await atlas.listCards(workspaceA.record.workspace_id);
    expect(recollected).toHaveLength(1);
    expect(recollected[0]?.canonical_name).toBe("组合集中度");
    expect(recollected[0]?.first_analysis_id).toBe(secondId);
  });

  it("cascades atlas runs, cards, and encounters on active deletion and TTL expiry", async () => {
    const database = open();
    const workspaceStore = new SqliteWorkspaceStore(database);
    const workspaces = new WorkspaceService(workspaceStore);
    const history = new SqliteHistoryStore(database);
    const atlas = new AtlasService(new SqliteAtlasStore(database), generator);
    const activeDelete = await workspaces.create();
    const expiring = await workspaces.create();
    const activeId = idFor("meme", "active-delete");
    const expiryId = idFor("meme", "expiry");
    const snapshot = structuredClone(getFixture("supported_full").snapshot);

    await saveHistory(history, activeDelete.record.workspace_id, activeId);
    await saveHistory(history, expiring.record.workspace_id, expiryId);
    await atlas.start({ workspaceId: activeDelete.record.workspace_id, analysis: analysis(activeId), snapshot });
    await atlas.start({ workspaceId: expiring.record.workspace_id, analysis: analysis(expiryId), snapshot });
    await atlas.waitForIdle();
    expect(await atlas.listCards(activeDelete.record.workspace_id)).toHaveLength(1);
    expect(await atlas.listCards(expiring.record.workspace_id)).toHaveLength(1);

    expect((await workspaces.delete(activeDelete.record.locator)).ok).toBe(true);
    expect(await atlas.listCards(activeDelete.record.workspace_id)).toEqual([]);
    expect(await atlas.getOutcome(activeDelete.record.workspace_id, activeId)).toBeNull();

    await workspaceStore.put({ ...expiring.record, expires_at: "2000-01-01T00:00:00.000Z" });
    expect(await workspaces.purgeExpired()).toMatchObject({
      purged: [expiring.record.workspace_id],
      failed: [],
    });
    expect(await atlas.listCards(expiring.record.workspace_id)).toEqual([]);
    expect(await atlas.getOutcome(expiring.record.workspace_id, expiryId)).toBeNull();
  });
});
