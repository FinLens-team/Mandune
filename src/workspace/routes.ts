import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { WorkspaceService } from "./service.js";
import { WORKSPACE_COOKIE } from "./types.js";

const UNAUTHORIZED = { error: "unauthorized" } as const;

function attachLocatorCookie(
  c: Parameters<typeof setCookie>[0],
  locator: string,
): void {
  setCookie(c, WORKSPACE_COOKIE, locator, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function createWorkspaceRoutes(
  service: WorkspaceService,
  options: { onDeleted?: (workspaceId: string) => Promise<void> } = {},
): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const { record, status } = await service.create();
    attachLocatorCookie(c, record.locator);
    return c.json({ workspace: status }, 201);
  });

  app.get("/current", async (c) => {
    const locator = getCookie(c, WORKSPACE_COOKIE);
    const access = await service.authorize(locator);
    if (!access.ok) {
      return c.json(UNAUTHORIZED, 401);
    }
    return c.json({ workspace: access.status });
  });

  app.post("/current/activity", async (c) => {
    const locator = getCookie(c, WORKSPACE_COOKIE);
    const access = await service.touch(locator);
    if (!access.ok) {
      return c.json(UNAUTHORIZED, 401);
    }
    attachLocatorCookie(c, access.workspace.locator);
    return c.json({ workspace: access.status });
  });

  app.delete("/current", async (c) => {
    const locator = getCookie(c, WORKSPACE_COOKIE);
    const result = await service.delete(locator);
    deleteCookie(c, WORKSPACE_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
    });
    if (!result.ok) {
      return c.json(UNAUTHORIZED, 401);
    }
    await options.onDeleted?.(result.result.workspace_id);
    return c.json({ deleted: result.result });
  });

  return app;
}
