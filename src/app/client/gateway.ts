import {
  validatePortfolioDraft,
  validatePortfolioSnapshot,
  validateTaskEvent,
  type AnalysisResult,
  type DraftLine,
  type EvidenceRecord,
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
  HistoryExperienceSource,
  HistoryReadResult,
  HistoryReplayResult,
  HistorySummary,
} from "../../history/index.js";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import { isThemeId, type ThemeId } from "../../theme/index.js";
import {
  validateAtlasCard,
  validateAtlasDetail,
  validateAtlasOutcome,
} from "../../atlas/validation.js";
import type {
  AtlasCardDetail,
  AtlasCardV1,
  AtlasOutcome,
} from "../../atlas/types.js";

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
  theme_id?: ThemeId;
}

export interface AnalysisSourceResponse {
  kind: "fixture" | "live" | "unavailable";
  is_live: boolean;
  label: string;
}

export interface AnalysisHoldingPage {
  analysis_id: string;
  holdings: import("../../contracts/index.js").PortfolioSnapshot["lines"];
  next_cursor: string | null;
  total: number;
}

export interface AnalysisEvidencePage {
  analysis_id: string;
  evidence: EvidenceRecord[];
  next_cursor: string | null;
  total: number;
}

export interface RandomExampleHolding {
  line: DraftLine;
  valuation: {
    current_market_value_cny: number;
    cost_basis_cny: number;
    cash_balance_cny: number;
    position_units: number;
    source: {
      kind: "public_delayed" | "local_fallback";
      is_live: false;
      name: string;
      locator: string;
      observation_date: string;
      historical_observation_date: string;
      current_price_cny: number;
      historical_price_cny: number;
      limitations: string[];
    };
  };
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
      snapshot: import("../../contracts/index.js").PortfolioSnapshot;
      experienceSource?: HistoryExperienceSource;
      narrative?: ThemeModelOutput;
      aiText?: string;
      aiThemeText?: string;
    };

export interface JourneyGateway {
  readonly pollIntervalMs: number;
  deleteWorkspace(): Promise<void>;
  ensureWorkspace(): Promise<WorkspacePublicStatus>;
  getAnalysisEvents(analysisId: string): Promise<TaskEvent[]>;
  getAnalysisHoldingsPage?(analysisId: string, options?: { cursor?: string; limit?: number }): Promise<AnalysisHoldingPage>;
  getAnalysisEvidencePage?(analysisId: string, options?: { cursor?: string; limit?: number }): Promise<AnalysisEvidencePage>;
  getAnalysisResult(analysisId: string): Promise<AnalysisResultResponse>;
  getAnalysisStatus(analysisId: string): Promise<AnalysisStatusResponse>;
  getCurrentDraft(): Promise<PortfolioDraft | null>;
  getRandomExampleHolding?(): Promise<RandomExampleHolding>;
  getDetail(workspaceId: string, recordId: string): Promise<HistoryReadResult>;
  list(workspaceId: string): Promise<HistorySummary[]>;
  replayHistory(recordId: string): Promise<HistoryReplayResult>;
  saveCurrentDraft(draft: PortfolioDraft): Promise<PortfolioDraft>;
  startAnalysis(experienceSource: HistoryExperienceSource, themeId?: ThemeId): Promise<{
    analysis_id: string;
    experience_source: HistoryExperienceSource;
    reused_active: boolean;
    theme_id?: ThemeId;
  }>;
  subscribeAnalysisStream?(
    analysisId: string,
    onText: (text: string) => void,
  ): () => void;
  touchWorkspace(): Promise<WorkspacePublicStatus>;
}

export interface AtlasGateway {
  getAtlasOutcome(analysisId: string): Promise<AtlasOutcome | null>;
  listAtlasCards(): Promise<AtlasCardV1[]>;
  getAtlasCard(cardId: string): Promise<AtlasCardDetail | null>;
  deleteAtlasCard(cardId: string): Promise<void>;
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

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function randomExampleLine(value: unknown): value is DraftLine {
  return validatePortfolioDraft({
    draft_id: "draft-random-example-validation",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    constraints: {
      investment_horizon: "unknown",
      near_term_liquidity: "unknown",
      tolerable_drawdown: "unknown",
      investment_objective: "unknown",
    },
    lines: [value],
  }).ok;
}

function randomExampleHolding(value: unknown): value is RandomExampleHolding {
  if (!object(value) || !randomExampleLine(value.line) || !object(value.valuation)) return false;
  const valuation = value.valuation;
  if (
    !finiteNonNegative(valuation.current_market_value_cny) ||
    !finiteNonNegative(valuation.cost_basis_cny) ||
    !finiteNonNegative(valuation.cash_balance_cny) ||
    !Number.isSafeInteger(valuation.position_units) || Number(valuation.position_units) <= 0 ||
    !object(valuation.source)
  ) return false;
  const source = valuation.source;
  return (source.kind === "public_delayed" || source.kind === "local_fallback") &&
    source.is_live === false &&
    typeof source.name === "string" && source.name.length > 0 &&
    typeof source.locator === "string" && source.locator.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(source.observation_date)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(source.historical_observation_date)) &&
    finiteNonNegative(source.current_price_cny) && source.current_price_cny > 0 &&
    finiteNonNegative(source.historical_price_cny) && source.historical_price_cny > 0 &&
    Array.isArray(source.limitations) && source.limitations.every((item) => typeof item === "string");
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
    if (!object(record.snapshot) || !object(record.analysis)) {
      return { status: "unavailable", code: "storage_failure" };
    }
    const summarySnapshot = record.snapshot;
    const deferredSnapshot = Array.isArray(summarySnapshot.lines) === false &&
      Number.isSafeInteger(summarySnapshot.lines_total) && Number(summarySnapshot.lines_total) >= 0;
    const snapshot = deferredSnapshot ? { ...summarySnapshot, lines: [] } : summarySnapshot;
    const summaryAnalysis = record.analysis;
    const deferredEvidence = Array.isArray(summaryAnalysis.evidence) === false &&
      Number.isSafeInteger(summaryAnalysis.evidence_total) && Number(summaryAnalysis.evidence_total) >= 0;
    const analysis = deferredEvidence
      ? { ...summaryAnalysis, evidence: [] }
      : summaryAnalysis;
    if (
      (deferredSnapshot || validatePortfolioSnapshot(snapshot).ok) &&
      (deferredEvidence || validateOwnedAnalysisResult(analysis as unknown as AnalysisResult).ok) &&
      analysis.snapshot_id === snapshot.snapshot_id &&
      (record.experience_source === undefined ||
        record.experience_source === "random" ||
        record.experience_source === "edited")
    ) {
      return { ...value, record: { ...record, analysis, snapshot } } as unknown as HistoryReadResult;
    }
    return { status: "unavailable", code: "storage_failure" };
  }
  if (["not_found", "unsupported_version", "unreadable", "unavailable"].includes(value.status)) {
    return value as unknown as HistoryReadResult;
  }
  return { status: "unavailable", code: "storage_failure" };
}

export class FetchJourneyGateway implements JourneyGateway, AtlasGateway {
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

  async getRandomExampleHolding(): Promise<RandomExampleHolding> {
    const response = await this.response("/api/random-examples/holding", { method: "POST" });
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (!object(body) || !randomExampleHolding(body.example)) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    return body.example;
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

  async startAnalysis(experienceSource: HistoryExperienceSource, themeId?: ThemeId): Promise<{
    analysis_id: string;
    experience_source: HistoryExperienceSource;
    reused_active: boolean;
    theme_id: ThemeId;
  }> {
    const response = await this.response("/api/analyses", {
      method: "POST",
      body: JSON.stringify({ experience_source: experienceSource, ...(themeId ? { theme_id: themeId } : {}) }),
    });
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (
      !object(body) ||
      !identifier(body.analysis_id) ||
      (body.experience_source !== "random" && body.experience_source !== "edited") ||
      typeof body.reused_active !== "boolean"
      || !isThemeId(body.theme_id)
    ) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    return {
      analysis_id: body.analysis_id,
      experience_source: body.experience_source,
      reused_active: body.reused_active,
      theme_id: body.theme_id,
    };
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
      || !isThemeId(analysis.theme_id)
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

  async getAnalysisHoldingsPage(
    analysisId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<AnalysisHoldingPage> {
    const query = new URLSearchParams({ limit: String(options.limit ?? 20) });
    if (options.cursor) query.set("cursor", options.cursor);
    const response = await this.response(`/api/analyses/${encodeURIComponent(analysisId)}/holdings?${query}`);
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (
      !object(body) || body.analysis_id !== analysisId || !Array.isArray(body.holdings) ||
      !body.holdings.every((line) => object(line) && identifier(line.line_id)) ||
      (body.next_cursor !== null && !identifier(String(body.next_cursor))) ||
      !Number.isSafeInteger(body.total) || Number(body.total) < body.holdings.length
    ) throw new JourneyGatewayError("invalid_response", response.status);
    return body as unknown as AnalysisHoldingPage;
  }

  async getAnalysisEvidencePage(
    analysisId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<AnalysisEvidencePage> {
    const query = new URLSearchParams({ limit: String(options.limit ?? 20) });
    if (options.cursor) query.set("cursor", options.cursor);
    const response = await this.response(`/api/analyses/${encodeURIComponent(analysisId)}/evidence?${query}`);
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (
      !object(body) ||
      body.analysis_id !== analysisId ||
      !Array.isArray(body.evidence) ||
      !body.evidence.every((item) => object(item) && identifier(item.id)) ||
      (body.next_cursor !== null && !identifier(String(body.next_cursor))) ||
      !Number.isSafeInteger(body.total) || Number(body.total) < body.evidence.length
    ) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    return body as unknown as AnalysisEvidencePage;
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
    const summary = body.analysis;
    if (
      summary.analysis_id !== analysisId ||
      "evidence" in summary ||
      !Number.isSafeInteger(summary.evidence_total) ||
      Number(summary.evidence_total) < 0 ||
      !object(body.snapshot) ||
      "lines" in body.snapshot ||
      !Number.isSafeInteger(body.snapshot.lines_total) || Number(body.snapshot.lines_total) < 0
    ) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    // Evidence records deliberately travel only through getAnalysisEvidencePage().
    // The existing report core still receives an empty typed array for backwards-compatible rendering.
    const analysis = { ...summary, evidence: [] } as unknown as AnalysisResult;
    const source = body.source;
    if (
      (source.kind !== "fixture" && source.kind !== "live" && source.kind !== "unavailable") ||
      typeof source.is_live !== "boolean" ||
      typeof source.label !== "string" ||
      source.label.length === 0
    ) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    const narrative = validatedNarrative(body.narrative, analysis);
    const aiText = typeof body.ai_text === "string" && body.ai_text.trim() ? body.ai_text : undefined;
    const aiThemeText = typeof body.ai_theme_text === "string" && body.ai_theme_text.trim() ? body.ai_theme_text : undefined;
    return {
      status: "ready",
      analysis_id: analysisId,
      source: source as unknown as AnalysisSourceResponse,
      analysis,
      snapshot: { ...body.snapshot, lines: [] } as unknown as import("../../contracts/index.js").PortfolioSnapshot,
      ...(body.experience_source === "random" || body.experience_source === "edited"
        ? { experienceSource: body.experience_source }
        : {}),
      ...(narrative ? { narrative } : {}),
      ...(aiText ? { aiText } : {}),
      ...(aiThemeText ? { aiThemeText } : {}),
    };
  }

  subscribeAnalysisStream(analysisId: string, onText: (text: string) => void): () => void {
    if (typeof EventSource === "undefined") return () => undefined;
    const source = new EventSource(`/api/analyses/${encodeURIComponent(analysisId)}/stream`);
    const onDelta = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { text?: unknown };
        if (typeof payload.text === "string") onText(payload.text);
      } catch {
        // Polling remains the recovery path for malformed or interrupted SSE.
      }
    };
    const close = () => source.close();
    source.addEventListener("delta", onDelta);
    source.addEventListener("done", close);
    return close;
  }

  async getAtlasOutcome(analysisId: string): Promise<AtlasOutcome | null> {
    const response = await this.response(`/api/atlas/outcomes/${encodeURIComponent(analysisId)}`);
    if (response.status === 404) return null;
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    const outcome = object(body) ? body.outcome : undefined;
    if (!validateAtlasOutcome(outcome) || outcome.analysis_id !== analysisId) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    return outcome;
  }

  async listAtlasCards(): Promise<AtlasCardV1[]> {
    const response = await this.response("/api/atlas/cards");
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (!object(body) || !Array.isArray(body.cards) || !body.cards.every(validateAtlasCard)) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    return body.cards;
  }

  async getAtlasCard(cardId: string): Promise<AtlasCardDetail | null> {
    const response = await this.response(`/api/atlas/cards/${encodeURIComponent(cardId)}`);
    if (response.status === 404) return null;
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    const detail = object(body) ? body.detail : undefined;
    if (!validateAtlasDetail(detail) || detail.card.card_id !== cardId) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
    return detail;
  }

  async deleteAtlasCard(cardId: string): Promise<void> {
    const response = await this.response(`/api/atlas/cards/${encodeURIComponent(cardId)}`, {
      method: "DELETE",
    });
    if (!response.ok) this.failure(response);
    const body = await this.json(response);
    if (!object(body) || body.deleted !== true || body.card_id !== cardId) {
      throw new JourneyGatewayError("invalid_response", response.status);
    }
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
