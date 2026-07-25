import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import type { WorkspaceService } from "../workspace/index.js";
import { WORKSPACE_COOKIE } from "../workspace/index.js";
import type { AtlasService } from "./service.js";

const UNAUTHORIZED = { error: "unauthorized" } as const;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,160}$/;

async function workspaceId(c: Context, workspaces: WorkspaceService): Promise<string | null> {
  const access = await workspaces.authorize(getCookie(c, WORKSPACE_COOKIE));
  return access.ok ? access.workspace.workspace_id : null;
}

export function createAtlasRoutes(input: { workspaces: WorkspaceService; atlas: AtlasService }): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/outcomes/:analysisId", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const analysisId = c.req.param("analysisId");
    if (!IDENTIFIER.test(analysisId)) return c.json({ error: "not_found" }, 404);
    const outcome = await input.atlas.getOutcome(id, analysisId);
    return outcome ? c.json({ outcome }) : c.json({ error: "not_found" }, 404);
  });

  app.get("/cards", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    return c.json({ cards: await input.atlas.listCards(id) });
  });

  app.get("/cards/:cardId", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const cardId = c.req.param("cardId");
    if (!IDENTIFIER.test(cardId)) return c.json({ error: "not_found" }, 404);
    const detail = await input.atlas.getCard(id, cardId);
    return detail ? c.json({ detail }) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/cards/:cardId", async (c) => {
    const id = await workspaceId(c, input.workspaces);
    if (!id) return c.json(UNAUTHORIZED, 401);
    const cardId = c.req.param("cardId");
    if (!IDENTIFIER.test(cardId)) return c.json({ error: "not_found" }, 404);
    return await input.atlas.deleteCard(id, cardId)
      ? c.json({ deleted: true, card_id: cardId })
      : c.json({ error: "not_found" }, 404);
  });

  return app;
}
