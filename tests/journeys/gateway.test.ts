import { describe, expect, it, vi } from "vitest";
import {
  FetchJourneyGateway,
  type JourneyFetch,
} from "../../src/app/client/index.js";
import { createExampleDraft } from "../../src/portfolio/index.js";
import type { PortfolioDraft } from "../../src/contracts/index.js";

const workspace = {
  workspace_id: "workspace_public_a",
  last_active_at: "2026-07-25T08:00:00.000Z",
  expires_at: "2026-08-24T08:00:00.000Z",
  ttl_days: 30 as const,
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("journey HTTP gateway workspace bootstrap", () => {
  it("uses the current workspace and never creates another one on success", async () => {
    const calls: string[] = [];
    const fetcher: JourneyFetch = vi.fn(async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url} ${init?.credentials ?? "none"}`);
      return json({ workspace });
    });
    const gateway = new FetchJourneyGateway(fetcher);

    await expect(gateway.ensureWorkspace()).resolves.toEqual(workspace);
    expect(calls).toEqual(["GET /api/workspaces/current same-origin"]);
  });

  it("creates only after an explicit 401 from GET current", async () => {
    const calls: string[] = [];
    const fetcher: JourneyFetch = vi.fn(async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return url === "/api/workspaces/current"
        ? json({ error: "unauthorized" }, 401)
        : json({ workspace }, 201);
    });
    const gateway = new FetchJourneyGateway(fetcher);

    await expect(gateway.ensureWorkspace()).resolves.toEqual(workspace);
    expect(calls).toEqual(["GET /api/workspaces/current", "POST /api/workspaces"]);
  });

  it.each([
    ["503", async () => json({ error: "unavailable" }, 503), "unavailable"],
    ["network", async () => { throw new Error("offline"); }, "network"],
  ] as const)("does not create after %s", async (_name, current, code) => {
    const calls: string[] = [];
    const fetcher: JourneyFetch = vi.fn(async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return current();
    });
    const gateway = new FetchJourneyGateway(fetcher);

    await expect(gateway.ensureWorkspace()).rejects.toMatchObject({ code });
    expect(calls).toEqual(["GET /api/workspaces/current"]);
  });
});

describe("journey HTTP gateway privacy and isolation", () => {
  function sessionTransport(sessionId: "a" | "b") {
    let draft: PortfolioDraft | null = null;
    const calls: string[] = [];
    const fetcher: JourneyFetch = async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === "/api/current-draft" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { draft: PortfolioDraft };
        draft = structuredClone(body.draft);
        return json({ draft });
      }
      if (url === "/api/current-draft") return json({ draft });
      if (url === "/api/workspaces/current") {
        return json({ workspace: { ...workspace, workspace_id: `workspace_public_${sessionId}` } });
      }
      return json({ error: "not_found" }, 404);
    };
    return { calls, gateway: new FetchJourneyGateway(fetcher) };
  }

  it("keeps two cookie sessions isolated without workspace ids in transport URLs", async () => {
    const a = sessionTransport("a");
    const b = sessionTransport("b");
    const draft = createExampleDraft();
    draft.source_label = "随机体验身份 · 测试 fixture · 非实时行情";

    await a.gateway.saveCurrentDraft(draft);
    await expect(a.gateway.getCurrentDraft()).resolves.toEqual(draft);
    await expect(b.gateway.getCurrentDraft()).resolves.toBeNull();

    const loggedTransport = JSON.stringify([...a.calls, ...b.calls]);
    expect(loggedTransport).not.toContain("workspace_public_a");
    expect(loggedTransport).not.toContain("workspace_public_b");
    expect(loggedTransport).not.toContain("510300.SH");
    expect(loggedTransport).not.toContain("持仓");
  });

  it("filters malformed, foreign, and private task events without logging payloads", async () => {
    const fetcher: JourneyFetch = async () => json({
      analysis_id: "analysis_safe",
      events: [
        {
          event_id: "event-safe",
          analysis_id: "analysis_safe",
          stage: "validate_snapshot",
          state: "succeeded",
          occurred_at: "2026-07-25T08:00:00.000Z",
        },
        {
          event_id: "event-foreign",
          analysis_id: "analysis_other",
          stage: "resolve_assets",
          state: "running",
          occurred_at: "2026-07-25T08:00:01.000Z",
        },
        {
          event_id: "event-private",
          analysis_id: "analysis_safe",
          stage: "resolve_assets",
          state: "running",
          occurred_at: "2026-07-25T08:00:02.000Z",
          account_number: "1234567890",
        },
      ],
    });
    const gateway = new FetchJourneyGateway(fetcher);

    await expect(gateway.getAnalysisEvents("analysis_safe")).resolves.toEqual([
      expect.objectContaining({ event_id: "event-safe" }),
    ]);
  });

  it("sends and validates the analysis-time experience source", async () => {
    let requestBody: unknown;
    const gateway = new FetchJourneyGateway(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return json({
        analysis_id: "analysis_source",
        experience_source: "edited",
        reused_active: false,
        theme_id: "eastern_observation",
      }, 202);
    });

    await expect(gateway.startAnalysis("edited")).resolves.toEqual({
      analysis_id: "analysis_source",
      experience_source: "edited",
      reused_active: false,
      theme_id: "eastern_observation",
    });
    expect(requestBody).toEqual({ experience_source: "edited" });
  });

  it("preserves an unsupported history version instead of replaying it", async () => {
    const fetcher: JourneyFetch = async (url) => {
      if (url.endsWith("/replay")) {
        return json({ history: {
          status: "unsupported_version",
          summary: {
            record_id: "analysis_old",
            analysis_id: "analysis_old",
            snapshot_id: "snapshot_old",
            analysis_completed_at: "2026-07-25T08:00:00.000Z",
            evidence_cutoff_at: "2026-07-25T07:00:00.000Z",
            result_status: "limited",
            theme_id: "eastern_observation",
            narrative_status: "available",
            readability: "unsupported_version",
            versions: {
              history_schema: "analysis-history.v0",
              contracts: "0.9.0",
              rational_analysis: "rational-analysis.v0",
              theme_narrative: "theme-narrative.v0",
            },
          },
          unsupported_versions: [{ component: "history_schema", version: "analysis-history.v0" }],
        } });
      }
      return json({ error: "not_found" }, 404);
    };
    const gateway = new FetchJourneyGateway(fetcher);

    await expect(gateway.replayHistory("analysis_old")).resolves.toMatchObject({
      status: "unsupported_version",
      unsupported_versions: [{ version: "analysis-history.v0" }],
    });
  });
});
