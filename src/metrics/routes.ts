import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { MetricsService } from "./service.js";

const VISITOR_COOKIE = "MANDUNE_VISITOR";

export function createMetricsRoutes(service: MetricsService): Hono {
  const app = new Hono();

  app.post("/visit", async (c) => {
    const result = await service.recordVisit(getCookie(c, VISITOR_COOKIE));
    if (result.cookie) {
      setCookie(c, VISITOR_COOKIE, result.cookie, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 2 * 24 * 60 * 60,
      });
    }
    return c.json({ metrics: result.snapshot });
  });

  app.get("/today", async (c) => c.json({ metrics: await service.today() }));

  return app;
}
