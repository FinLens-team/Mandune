import { isDeepStrictEqual } from "node:util";
import {
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  THEME_NARRATIVE_SCHEMA_VERSION,
  validateOwnedAnalysisResult,
  validateThemeModelOutput,
  type AnalysisCommitFence,
  type AnalysisResultSink,
  type RationalModelOutput,
  type ThemeModelOutput,
} from "../analysis/index.js";
import {
  CONTRACTS_VERSION,
  validatePortfolioSnapshot,
  type AnalysisResult,
  type PortfolioSnapshot,
} from "../contracts/index.js";
import type { HistoryStore } from "./store.js";
import { MemoryHistoryStore } from "./store.js";
import {
  HISTORY_SCHEMA_VERSION,
  HistoryAccessError,
  HistorySaveError,
  type HistoryReadResult,
  type HistoryRecordV1,
  type HistoryReplayResult,
  type HistorySummary,
  type HistoryVersions,
  type StoredHistoryEnvelope,
  type UnsupportedHistoryVersion,
} from "./types.js";

interface SinkPayload {
  analysis: AnalysisResult;
  rational_analysis_version: string;
  narrative?: ThemeModelOutput;
  ai_text?: string;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function versionsFromEnvelope(record: StoredHistoryEnvelope): HistoryVersions {
  return {
    history_schema: record.versions.history_schema,
    contracts: record.versions.contracts,
    rational_analysis: record.versions.rational_analysis,
    theme_narrative: record.versions.theme_narrative,
  };
}

function unsupportedVersions(versions: HistoryVersions): UnsupportedHistoryVersion[] {
  const unsupported: UnsupportedHistoryVersion[] = [];
  if (versions.history_schema !== HISTORY_SCHEMA_VERSION) {
    unsupported.push({ component: "history_schema", version: versions.history_schema });
  }
  if (versions.contracts !== CONTRACTS_VERSION) {
    unsupported.push({ component: "contracts", version: versions.contracts });
  }
  if (versions.rational_analysis !== RATIONAL_ANALYSIS_SCHEMA_VERSION) {
    unsupported.push({ component: "rational_analysis", version: versions.rational_analysis });
  }
  if (versions.theme_narrative !== null && versions.theme_narrative !== THEME_NARRATIVE_SCHEMA_VERSION) {
    unsupported.push({ component: "theme_narrative", version: versions.theme_narrative });
  }
  return unsupported;
}

function summaryOf(record: StoredHistoryEnvelope): HistorySummary {
  const versions = versionsFromEnvelope(record);
  return {
    record_id: record.record_id,
    analysis_id: record.analysis_id,
    snapshot_id: record.snapshot_id,
    analysis_completed_at: record.analysis_completed_at,
    evidence_cutoff_at: record.evidence_cutoff_at,
    result_status: record.result_status,
    theme_id: record.theme_id,
    narrative_status: versions.theme_narrative === null ? "not_generated" : "available",
    versions,
    readability: unsupportedVersions(versions).length === 0 ? "readable" : "unsupported_version",
  };
}

function rationalView(record: HistoryRecordV1): RationalModelOutput {
  return {
    schema_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
    conclusions: record.analysis.conclusions,
    advice: record.analysis.advice,
    assumptions: record.analysis.assumptions,
    limitations: record.analysis.limitations,
    risk_notes: record.analysis.risk_notes,
  };
}

function recordIsValid(record: HistoryRecordV1, envelope: StoredHistoryEnvelope): boolean {
  if (
    record.schema_version !== HISTORY_SCHEMA_VERSION ||
    record.record_id !== envelope.record_id ||
    record.analysis.analysis_id !== envelope.analysis_id ||
    record.analysis.snapshot_id !== envelope.snapshot_id ||
    record.snapshot.snapshot_id !== envelope.snapshot_id ||
    record.analysis.analysis_completed_at !== envelope.analysis_completed_at ||
    record.analysis.evidence_cutoff_at !== envelope.evidence_cutoff_at ||
    record.analysis.status !== envelope.result_status ||
    record.analysis.theme_id !== envelope.theme_id ||
    record.snapshot.theme_id !== envelope.theme_id ||
    record.rational_analysis_version !== RATIONAL_ANALYSIS_SCHEMA_VERSION ||
    record.theme_narrative_version !== envelope.versions.theme_narrative ||
    record.snapshot.contracts_version !== CONTRACTS_VERSION ||
    record.analysis.contracts_version !== CONTRACTS_VERSION ||
    !isDeepStrictEqual(record.snapshot.constraints, record.analysis.constraints)
  ) return false;

  if (!validatePortfolioSnapshot(record.snapshot).ok || !validateOwnedAnalysisResult(record.analysis).ok) return false;
  if (!record.narrative) return record.theme_narrative_version === null;
  return record.theme_narrative_version === THEME_NARRATIVE_SCHEMA_VERSION &&
    validateThemeModelOutput(record.narrative, rationalView(record), {
      analysisId: record.analysis.analysis_id,
      themeId: record.analysis.theme_id,
    });
}

function historyRecordFromPayload(record: StoredHistoryEnvelope): HistoryRecordV1 | null {
  try {
    const parsed = JSON.parse(record.payload_json) as HistoryRecordV1;
    return recordIsValid(parsed, record) ? deepFreeze(parsed) : null;
  } catch {
    return null;
  }
}

function ensureWorkspaceId(workspaceId: string): void {
  if (workspaceId.trim().length === 0) throw new HistorySaveError("invalid_workspace");
}

export class HistoryService {
  constructor(private readonly store: HistoryStore = new MemoryHistoryStore()) {}

  createResultSink(workspaceId: string, snapshot: PortfolioSnapshot): AnalysisResultSink {
    ensureWorkspaceId(workspaceId);
    const frozenSnapshot = cloneJson(snapshot);
    if (!validatePortfolioSnapshot(frozenSnapshot).ok) throw new HistorySaveError("invalid_snapshot");
    deepFreeze(frozenSnapshot);
    return {
      save: (payload, fence) => this.save(workspaceId, frozenSnapshot, payload, fence),
    };
  }

  async save(
    workspaceId: string,
    snapshot: PortfolioSnapshot,
    payload: SinkPayload,
    fence: AnalysisCommitFence,
  ): Promise<void> {
    try {
      ensureWorkspaceId(workspaceId);
      const snapshotCopy = cloneJson(snapshot);
      const payloadCopy = cloneJson(payload);
      if (!validatePortfolioSnapshot(snapshotCopy).ok) throw new HistorySaveError("invalid_snapshot");
      if (!validateOwnedAnalysisResult(payloadCopy.analysis).ok) throw new HistorySaveError("invalid_result");
      if (
        payloadCopy.rational_analysis_version !== RATIONAL_ANALYSIS_SCHEMA_VERSION ||
        payloadCopy.analysis.contracts_version !== CONTRACTS_VERSION ||
        snapshotCopy.contracts_version !== CONTRACTS_VERSION
      ) throw new HistorySaveError("version_mismatch");
      if (
        payloadCopy.analysis.snapshot_id !== snapshotCopy.snapshot_id ||
        !isDeepStrictEqual(payloadCopy.analysis.constraints, snapshotCopy.constraints)
      ) throw new HistorySaveError("snapshot_mismatch");
      if (payloadCopy.analysis.theme_id !== snapshotCopy.theme_id) throw new HistorySaveError("theme_mismatch");

      if (payloadCopy.narrative) {
        const rational = rationalView({
          schema_version: HISTORY_SCHEMA_VERSION,
          record_id: payloadCopy.analysis.analysis_id,
          snapshot: snapshotCopy,
          analysis: payloadCopy.analysis,
          rational_analysis_version: payloadCopy.rational_analysis_version,
          theme_narrative_version: THEME_NARRATIVE_SCHEMA_VERSION,
          narrative: payloadCopy.narrative,
        });
        if (!validateThemeModelOutput(payloadCopy.narrative, rational, {
          analysisId: payloadCopy.analysis.analysis_id,
          themeId: payloadCopy.analysis.theme_id,
        })) throw new HistorySaveError("invalid_result");
      }

      const historyRecord: HistoryRecordV1 = {
        schema_version: HISTORY_SCHEMA_VERSION,
        record_id: payloadCopy.analysis.analysis_id,
        snapshot: snapshotCopy,
        analysis: payloadCopy.analysis,
        rational_analysis_version: payloadCopy.rational_analysis_version,
        theme_narrative_version: payloadCopy.narrative ? THEME_NARRATIVE_SCHEMA_VERSION : null,
        ...(payloadCopy.narrative ? { narrative: payloadCopy.narrative } : {}),
        ...(payloadCopy.ai_text ? { ai_text: payloadCopy.ai_text } : {}),
      };
      const versions: HistoryVersions = {
        history_schema: HISTORY_SCHEMA_VERSION,
        contracts: CONTRACTS_VERSION,
        rational_analysis: payloadCopy.rational_analysis_version,
        theme_narrative: historyRecord.theme_narrative_version,
      };
      const envelope: StoredHistoryEnvelope = {
        workspace_id: workspaceId,
        record_id: historyRecord.record_id,
        analysis_id: historyRecord.analysis.analysis_id,
        snapshot_id: historyRecord.snapshot.snapshot_id,
        analysis_completed_at: historyRecord.analysis.analysis_completed_at,
        evidence_cutoff_at: historyRecord.analysis.evidence_cutoff_at,
        result_status: historyRecord.analysis.status,
        theme_id: historyRecord.analysis.theme_id,
        versions,
        payload_json: JSON.stringify(historyRecord),
      };
      const result = await this.store.append(envelope, fence);
      if (result === "committed" || result === "idempotent") return;
      if (result === "fence_closed") throw new HistorySaveError("commit_fenced");
      if (result === "conflict") throw new HistorySaveError("record_conflict");
      throw new HistorySaveError("workspace_deleted");
    } catch (error) {
      if (error instanceof HistorySaveError) throw error;
      throw new HistorySaveError("storage_failure");
    }
  }

  async list(workspaceId: string): Promise<HistorySummary[]> {
    try {
      const records = await this.store.list(workspaceId);
      return records
        .filter((record) => record.workspace_id === workspaceId)
        .map(summaryOf)
        .sort((left, right) => {
          const completed = right.analysis_completed_at.localeCompare(left.analysis_completed_at);
          return completed !== 0 ? completed : left.analysis_id.localeCompare(right.analysis_id);
        });
    } catch {
      throw new HistoryAccessError();
    }
  }

  async getDetail(workspaceId: string, recordId: string): Promise<HistoryReadResult> {
    let envelope: StoredHistoryEnvelope | null;
    try {
      envelope = await this.store.get(workspaceId, recordId);
    } catch {
      return { status: "unavailable", code: "storage_failure" };
    }
    if (!envelope || envelope.workspace_id !== workspaceId) return { status: "not_found", code: "not_found" };
    const summary = summaryOf(envelope);
    const unsupported = unsupportedVersions(summary.versions);
    if (unsupported.length > 0) {
      return { status: "unsupported_version", summary, unsupported_versions: unsupported };
    }
    const record = historyRecordFromPayload(envelope);
    return record
      ? { status: "found", record }
      : { status: "unreadable", summary, code: "invalid_record" };
  }

  /** Replays only committed bytes. This method has no provider dependency. */
  async replay(workspaceId: string, recordId: string): Promise<HistoryReplayResult> {
    const result = await this.getDetail(workspaceId, recordId);
    return result.status === "found"
      ? { status: "replayed", source: "immutable_history", record: result.record }
      : result;
  }

  async eraseWorkspace(workspaceId: string): Promise<number> {
    try {
      return await this.store.eraseWorkspace(workspaceId);
    } catch {
      throw new HistoryAccessError();
    }
  }
}
