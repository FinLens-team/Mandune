import {
  validatePortfolioDraft,
  validatePortfolioSnapshot,
  validateTaskEvent,
  type AnalysisResult,
  type PortfolioDraft,
  type TaskEvent,
} from "../../contracts/index.js";
import {
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  validateOwnedAnalysisResult,
  validateThemeModelOutput,
  type RationalModelOutput,
  type ThemeModelOutput,
} from "../../analysis/index.js";
import type {
  HistoryReadResult,
  HistoryReplayResult,
  HistorySummary,
} from "../../history/index.js";
import type { WorkspacePublicStatus } from "../../workspace/index.js";

export type JourneyFetch = (input: string, init?: RequestInit) => Promise<Response>;

export class JourneyGatewayError extends Error {
  constructor(
    readonly code: "network" | "unauthorized" | "unavailable" | "invalid_response" | "request_failed",
    readonly status?: number,
  ) {
    super(code);
    this.name = "JourneyGatewayError";
  }
}

export interface AnalysisStatusResponse {
  analysis_id: string;
  state: "queued" | "running" | "terminal";
  created_at: string;
  updated_at: string;
  result_status?: AnalysisResult["status"];
  retryable?: boolean;
  terminal_reason?: string;
}

export interface AnalysisSourceResponse {
  kind: "fixture" | "unavailable";
  is_live: false;
  label: string;
}

export type AnalysisResultResponse =
  | { status: "pending"; analysis_id: string }
  | {
      status: "unavailable";
      analysis_id: string;
      reason: string;
      retryable: boolean;
    }
  | {
      status: "ready";
      analysis_id: string;
      source: AnalysisSourceResponse;
      analysis: AnalysisResult;
      narrative?: ThemeModelOutput;
    };

export interface JourneyGateway {
  readonly pollIntervalMs: number;
  deleteWorkspace(): Promise<void>;
  ensureWorkspace(): Promise<WorkspacePublicStatus>;
  getAnalysisEvents(analysisId: string): Promise<TaskEvent[]>;
  getAnalysisResult(analysisId: string): Promise<AnalysisResultResponse>;
  getAnalysisStatus(analysisId: string): Promise<AnalysisStatusResponse>;
  getCurrentDraft(): Promise<PortfolioDraft | null>;
  getDetail(workspaceId: string, recordId: string): Promise<HistoryReadResult>;
  list(workspaceId: string): Promise<HistorySummary[]>;
  replayHistory(recordId: string): Promise<HistoryReplayResult>;
  saveCurrentDraft(draft: PortfolioDraft): Promise<PortfolioDraft>;
  startAnalysis(): Promise<{ analysis_id: string; reused_active: boolean }>;
  touchWorkspace(): Promise<WorkspacePublicStatus>;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);
}

function iso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function workspaceStatus(value: unknown): value is WorkspacePublicStatus {
  return object(value) &&
    identifier(value.workspace_id) &&
    iso(value.last_active_at) &&
    iso(value.expires_at) &&
    value.ttl_days === 30;
}

function historySummary(value: unknown): value is HistorySummary {
  return object(value) &&
    identifier(value.record_id) &&
    identifier(value.analysis_id) &&
    typeof value.snapshot_id === "string" &&
    iso(value.analysis_completed_at) &&
    iso(value.evidence_cutoff_at) &&
    ["supported", "limited", "observation_only", "unavailable"].includes(String(value.result_status)) &&
    (value.readability === "readable" || value.readability === "unsupported_version");
}

function rationalFromAnalysis(analysis: AnalysisResult): RationalModelOutput {
  return {
    schema_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
    conclusions: analysis.conclusions,
    advice: analysis.advice,
    assumptions: analysis.assumptions,
    limitations: analysis.limitations,
    risk_notes: analysis.risk_notes,
  };
}

function validatedNarrative(
  value: unknown,
  analysis: AnalysisResult,
): ThemeModelOutput | undefined {
  return validateThemeModelOutput(value, rationalFromAnalysis(analysis), {
    analysisId: analysis.analysis_id,
    themeId: analysis.theme_id,
  })
    ? value
    : undefined;
}

function checkedHistoryRead(value: unknown): HistoryReadResult {
  if (!object(value) || typeof value.status !== "string") {
    return { status: "unavailable", code: "storage_failure" };
  }
  if (value.status === "found" && object(value.record)) {
    const record = value.record;
    if (
      object(record.snapshot) &&
      object(record.analysis) &&
      validatePortfolioSnapshot(record.snapshot).ok &&
      validateOwnedAnalysisResult(record.analysis as unknown as AnalysisResult).ok &&
      record.analysis.snapshot_id === record.snapshot.snapshot_id
    ) {
      return value as unknown as HistoryReadResult;
    }
    return { status: "unavailable", code: "storage_failure" };
  }
  if (["not_found", "unsupported_version", "unreadable", "unavailable"].includes(value.status)) {
    return value as unknown as HistoryReadResult;
  }
  return { status: "unavailable", code: "storage_failure" };
}

export class FetchJourneyGateway implements JourneyGateway {
  readonly pollIntervalMs: number;

  constructor(
    private readonly fetcher: JourneyFetch = globalThis.fetch.bind(globalThis),
    options: { pollIntervalMs?: number } = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
  }

  private async response(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetcher(path, {
        ...init,
        credentials: "same-origin",
        headers: {
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...init.headers,
        },
      });
    } catch {
      throw new JourneyGatewayError("network");
    }
  }

  private async json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
  }

  private failure(response: Response): never {
    if (response.status === 401) throw new JourneyGatewayError("unauthorized", 401);
    if (response.status === 503) throw new JourneyGatewayError("unavailable", 503);
    throw new JourneyGatewayError("request_failed", response.status);
  }

  async ensureWorkspace(): Promise<WorkspacePublicStatus> {
    const current = await this.response("/api/workspaces/current");
    if (current.ok) {
      const body = await this.json(current);
      if (object(body) && workspaceStatus(body.workspace)) return body.workspace;
      throw new JourneyGatewayError("invalid_response", current.status);
    }
    if (current.status !== 401) this.failure(current);

    const created = await this.response("/api/workspaces", { method: "POST" });
    if (!created.ok) this.failure(created);
    const body = await this.json(created);
    if (object(body) && workspaceStatus(body.workspace)) return body.workspace;
    throw new JourneyGatewayError("invalid_response", created.status);
  }

  async touchWorkspace(): Promise<WorkspacePublicStatus> {
    const response = await this.response("/api/workspaces/current/activity", { method: "POST" });
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (object(body) && workspaceStatus(body.workspace)) return body.workspace;
    throw new JourneyGatewayError("invalid_response", response.status);
  }

  async getCurrentDraft(): Promise<PortfolioDraft | null> {
    const response = await this.response("/api/current-draft");
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (!object(body) || body.draft === undefined) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    if (body.draft === null) return null;
    const checked = validatePortfolioDraft(body.draft);
    if (!checked.ok) throw new JourneyGatewayError("invalid_response", response.status);
    return checked.value;
  }

  async saveCurrentDraft(draft: PortfolioDraft): Promise<PortfolioDraft> {
    const response = await this.response("/api/current-draft", {
      method: "PUT",
      body: JSON.stringify({ draft }),
    });
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    const checked = object(body) ? validatePortfolioDraft(body.draft) : { ok: false as const };
    if (!checked.ok) throw new JourneyGatewayError("invalid_response", response.status);
    return checked.value;
  }

  async startAnalysis(): Promise<{ analysis_id: string; reused_active: boolean }> {
    const response = await this.response("/api/analyses", { method: "POST" });
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (!object(body) || !identifier(body.analysis_id) || typeof body.reused_active !== "boolean") {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    return { analysis_id: body.analysis_id, reused_active: body.reused_active };
  }

  async getAnalysisStatus(analysisId: string): Promise<AnalysisStatusResponse> {
    const response = await this.response(`/api/analyses/${encodeURIComponent(analysisId)}`);
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    const analysis = object(body) ? body.analysis : undefined;
    if (
      !object(analysis) ||
      analysis.analysis_id !== analysisId ||
      !["queued", "running", "terminal"].includes(String(analysis.state)) ||
      !iso(analysis.created_at) ||
      !iso(analysis.updated_at)
    ) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    return analysis as unknown as AnalysisStatusResponse;
  }

  async getAnalysisEvents(analysisId: string): Promise<TaskEvent[]> {
    const response = await this.response(`/api/analyses/${encodeURIComponent(analysisId)}/events`);
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (!object(body) || body.analysis_id !== analysisId || !Array.isArray(body.events)) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    return body.events.flatMap((event) => {
      const checked = validateTaskEvent(event);
      return checked.ok && checked.value.analysis_id === analysisId ? [checked.value] : [];
    });
  }

  async getAnalysisResult(analysisId: string): Promise<AnalysisResultResponse> {
    const response = await this.response(`/api/analyses/${encodeURIComponent(analysisId)}/result`);
    if (!(response.ok || response.status === 202)) this.failure(response);
    const body = await this.json(response);
    if (!object(body) || body.analysis_id !== analysisId) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    if (body.status === "pending") return { status: "pending", analysis_id: analysisId };
    if (
      body.status === "unavailable" &&
      typeof body.reason === "string" &&
      typeof body.retryable === "boolean"
    ) {
      return {
        status: "unavailable",
        analysis_id: analysisId,
        reason: body.reason,
        retryable: body.retryable,
      };
    }
    if (body.status !== "ready" || !object(body.analysis) || !object(body.source)) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    const analysis = body.analysis as unknown as AnalysisResult;
    if (analysis.analysis_id !== analysisId || !validateOwnedAnalysisResult(analysis).ok) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    const source = body.source;
    if (
      (source.kind !== "fixture" && source.kind !== "unavailable") ||
      source.is_live !== false ||
      typeof source.label !== "string" ||
      source.label.length === 0
    ) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    const narrative = validatedNarrative(body.narrative, analysis);
    return {
      status: "ready",
      analysis_id: analysisId,
      source: source as unknown as AnalysisSourceResponse,
      analysis,
      ...(narrative ? { narrative } : {}),
    };
  }

  async list(workspaceId: string): Promise<HistorySummary[]> {
    void workspaceId;
    const response = await this.response("/api/history");
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (!object(body) || !Array.isArray(body.history) || !body.history.every(historySummary)) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    return body.history;
  }

  async getDetail(workspaceId: string, recordId: string): Promise<HistoryReadResult> {
    void workspaceId;
    const response = await this.response(`/api/history/${encodeURIComponent(recordId)}`);
    if (response.status === 404) return { status: "not_found", code: "not_found" };
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    return checkedHistoryRead(object(body) ? body.history : undefined);
  }

  async replayHistory(recordId: string): Promise<HistoryReplayResult> {
    const response = await this.response(`/api/history/${encodeURIComponent(recordId)}/replay`);
    if (response.status === 404) return { status: "not_found", code: "not_found" };
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    const history = object(body) ? body.history : undefined;
    if (object(history) && history.status === "replayed" && history.source === "immutable_history") {
      const read = checkedHistoryRead({ status: "found", record: history.record });
      return read.status === "found"
        ? { status: "replayed", source: "immutable_history", record: read.record }
        : read;
    }
    return checkedHistoryRead(history) as HistoryReplayResult;
  }

  async deleteWorkspace(): Promise<void> {
    const response = await this.response("/api/workspaces/current", { method: "DELETE" });
    if (!response.ok) this.failure(response);
  }
}
