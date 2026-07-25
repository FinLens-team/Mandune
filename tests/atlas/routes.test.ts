import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  ATLAS_CANDIDATE_SCHEMA_VERSION,
  AtlasService,
  MemoryAtlasStore,
  createAtlasRoutes,
  type AtlasCandidateGenerator,
} from "../../src/atlas/index.js";
import { getFixture } from "../../src/fixtures/index.js";
import { WORKSPACE_COOKIE, WorkspaceService } from "../../src/workspace/index.js";

const generator: AtlasCandidateGenerator = {
  async generate(input) {
    if (input.selected_kind === "meme") {
      return {
        schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
        kind: "meme",
        canonical_name: "路由测试梗",
        aliases: [],
        scope_labels: [],
        generation_mode: "fixture",
        domain: null,
        meme_text: "路由各回各家。",
        plain_explanation: "工作区之间不能串卡。",
        theme: "测试",
      };
    }
    return {
      schema_version: ATLAS_CANDIDATE_SCHEMA_VERSION,
      kind: "professional_term",
      canonical_name: "工作区隔离",
      aliases: [],
      scope_labels: [],
      generation_mode: "fixture",
      domain: "other",
      plain_explanation: "每个匿名工作区只读取自己的图鉴。",
      why_today: "用于验证私密边界。",
      relation: "不跨工作区返回卡片。",
      misconception: "公开入口不等于公开数据。",
      boundary: "这里只验证访问隔离。",
      reference_ids: input.analysis.conclusions[0]?.refs.map((ref) => ref.ref_id) ?? [],
    };
  },
};

function cookie(locator: string): string {
  return `${WORKSPACE_COOKIE}=${locator}`;
}

describe("atlas HTTP routes", () => {
  it("isolates workspaces, returns no-store responses, and deletes only the requested card", async () => {
    const workspaces = new WorkspaceService();
    const atlas = new AtlasService(new MemoryAtlasStore(), generator);
    const app = new Hono().route("/api/atlas", createAtlasRoutes({ workspaces, atlas }));
    const workspaceA = await workspaces.create();
    const workspaceB = await workspaces.create();
    const fixture = getFixture("supported_full");
    await atlas.start({
      workspaceId: workspaceA.record.workspace_id,
      analysis: structuredClone(fixture.analysis),
      snapshot: structuredClone(fixture.snapshot),
    });
    await atlas.waitForIdle();

    const listA = await app.request("http://localhost/api/atlas/cards", {
      headers: { cookie: cookie(workspaceA.record.locator) },
    });
    expect(listA.status).toBe(200);
    expect(listA.headers.get("cache-control")).toBe("no-store");
    const bodyA = await listA.json() as { cards: Array<{ card_id: string }> };
    expect(bodyA.cards).toHaveLength(1);
    const cardId = bodyA.cards[0]!.card_id;

    const listB = await app.request("http://localhost/api/atlas/cards", {
      headers: { cookie: cookie(workspaceB.record.locator) },
    });
    expect(await listB.json()).toEqual({ cards: [] });
    expect((await app.request(`http://localhost/api/atlas/cards/${cardId}`, {
      headers: { cookie: cookie(workspaceB.record.locator) },
    })).status).toBe(404);
    expect((await app.request("http://localhost/api/atlas/cards", {
      headers: { cookie: cookie("forged-locator") },
    })).status).toBe(401);

    const deleted = await app.request(`http://localhost/api/atlas/cards/${cardId}`, {
      method: "DELETE",
      headers: { cookie: cookie(workspaceA.record.locator) },
    });
    expect(await deleted.json()).toEqual({ deleted: true, card_id: cardId });
    expect(await atlas.getOutcome(workspaceA.record.workspace_id, fixture.analysis.analysis_id)).toMatchObject({
      status: "no_card",
      reason: "card_deleted",
    });
  });
});
