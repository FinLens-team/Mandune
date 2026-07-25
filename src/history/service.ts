import { isDeepStrictEqual } from "node:util";
import {
  GENERATED_DAILY_REVIEW_SCHEMA_VERSION,
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  REVIEW_PACKET_SCHEMA_VERSION,
  THEME_NARRATIVE_SCHEMA_VERSION,
  validateOwnedAnalysisResult,
  validateStoredGeneratedDailyReview,
  validateThemeModelOutput,
  type AnalysisCommitFence,
  type AnalysisResultSink,
  type RationalModelOutput,
  type ThemeModelOutput,
  type ReviewPacketV2,
  type ValidatedGeneratedDailyReviewV2,
} from "../analysis/index.js";
import {
  DAILY_REVIEW_MODEL_ID,
  DAILY_REVIEW_PROMPT_VERSION,
  DAILY_REVIEW_SKILL_VERSIONS,
} from "../analysis/prompt-compiler.js";
import { ATLAS_GENERATION_POLICY_VERSION } from "../atlas/generation-policy.js";
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
  isHistoryExperienceSource,
  type HistoryExperienceSource,
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
  ai_theme_text?: string;
  review_packet?: ReviewPacketV2;
  generated_review?: ValidatedGeneratedDailyReviewV2;
  model_id?: string;
  prompt_version?: string;
  skill_versions?: { core: string; persona: string };
  atlas_policy_version?: string;
  experience_source?: HistoryExperienceSource;
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
    ...(record.versions.review_packet !== undefined
      ? { review_packet: record.versions.review_packet }
      : {}),
    ...(record.versions.generated_daily_review !== undefined
      ? { generated_daily_review: record.versions.generated_daily_review }
      : {}),
    ...(record.versions.prompt !== undefined ? { prompt: record.versions.prompt } : {}),
    ...(record.versions.atlas_policy !== undefined
      ? { atlas_policy: record.versions.atlas_policy }
      : {}),
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
  if (versions.review_packet !== undefined && versions.review_packet !== null &&
    versions.review_packet !== REVIEW_PACKET_SCHEMA_VERSION) {
    unsupported.push({ component: "review_packet", version: versions.review_packet });
  }
  if (versions.generated_daily_review !== undefined && versions.generated_daily_review !== null &&
    versions.generated_daily_review !== GENERATED_DAILY_REVIEW_SCHEMA_VERSION) {
    unsupported.push({ component: "generated_daily_review", version: versions.generated_daily_review });
  }
  if (versions.prompt !== undefined && versions.prompt !== null && versions.prompt !== DAILY_REVIEW_PROMPT_VERSION) {
    unsupported.push({ component: "prompt", version: versions.prompt });
  }
  if (versions.atlas_policy !== undefined && versions.atlas_policy !== null &&
    versions.atlas_policy !== ATLAS_GENERATION_POLICY_VERSION) {
    unsupported.push({ component: "atlas_policy", version: versions.atlas_policy });
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
    narrative_status: versions.theme_narrative === null && !versions.generated_daily_review
      ? "not_generated"
      : "available",
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

function v2RecordIsValid(record: HistoryRecordV1, envelope: StoredHistoryEnvelope): boolean {
  const fields = [
    record.review_packet,
    record.generated_review,
    record.model_id,
    record.prompt_version,
    record.skill_versions,
    record.atlas_policy_version,
  ];
  if (fields.every((value) => value === undefined)) {
    return envelope.versions.review_packet === undefined &&
      envelope.versions.generated_daily_review === undefined &&
      envelope.versions.prompt === undefined &&
      envelope.versions.atlas_policy === undefined;
  }
  if (!record.review_packet || !record.generated_review || !record.model_id ||
    !record.prompt_version || !record.skill_versions || !record.atlas_policy_version) return false;
  const expectedPersonaSkill = (DAILY_REVIEW_SKILL_VERSIONS.personas as Readonly<Record<string, string>>)[
    record.review_packet.persona_id
  ];
  if (
    record.review_packet.schema_version !== REVIEW_PACKET_SCHEMA_VERSION ||
    record.generated_review.schema_version !== GENERATED_DAILY_REVIEW_SCHEMA_VERSION ||
    record.model_id !== DAILY_REVIEW_MODEL_ID ||
    record.prompt_version !== DAILY_REVIEW_PROMPT_VERSION ||
    record.atlas_policy_version !== ATLAS_GENERATION_POLICY_VERSION ||
    record.skill_versions.core !== DAILY_REVIEW_SKILL_VERSIONS.core ||
    expectedPersonaSkill === undefined ||
    record.skill_versions.persona !== expectedPersonaSkill ||
    envelope.versions.review_packet !== REVIEW_PACKET_SCHEMA_VERSION ||
    envelope.versions.generated_daily_review !== GENERATED_DAILY_REVIEW_SCHEMA_VERSION ||
    envelope.versions.prompt !== DAILY_REVIEW_PROMPT_VERSION ||
    envelope.versions.atlas_policy !== ATLAS_GENERATION_POLICY_VERSION
  ) return false;
  const packet = record.review_packet;
  if (
    packet.analysis_id !== record.analysis.analysis_id ||
    packet.snapshot_id !== record.snapshot.snapshot_id ||
    packet.latest_complete_trading_day !== record.analysis.latest_complete_trading_day ||
    packet.evidence_cutoff_at !== record.analysis.evidence_cutoff_at ||
    !isDeepStrictEqual(packet.holdings, record.snapshot.lines) ||
    !isDeepStrictEqual(packet.constraints, record.snapshot.constraints) ||
    !isDeepStrictEqual(packet.evidence, record.analysis.evidence) ||
    !isDeepStrictEqual(packet.derived, record.analysis.derived) ||
    !isDeepStrictEqual(packet.coverage, record.analysis.coverage) ||
    !isDeepStrictEqual(packet.unknowns, record.analysis.unknowns)
  ) return false;
  if (!validateStoredGeneratedDailyReview(record.generated_review, packet)) return false;
  return record.ai_text === record.generated_review.rational_report.markdown &&
    record.ai_theme_text === record.generated_review.persona_report.markdown;
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
    !isDeepStrictEqual(record.snapshot.constraints, record.analysis.constraints) ||
    (record.experience_source !== undefined && !isHistoryExperienceSource(record.experience_source))
  ) return false;

  if (!validatePortfolioSnapshot(record.snapshot).ok || !validateOwnedAnalysisResult(record.analysis).ok) return false;
  if (!v2RecordIsValid(record, envelope)) return false;
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
      if (
        payloadCopy.experience_source !== undefined &&
        !isHistoryExperienceSource(payloadCopy.experience_source)
      ) throw new HistorySaveError("invalid_result");

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
        ...(payloadCopy.experience_source
          ? { experience_source: payloadCopy.experience_source }
          : {}),
        ...(payloadCopy.narrative ? { narrative: payloadCopy.narrative } : {}),
        ...(payloadCopy.ai_text ? { ai_text: payloadCopy.ai_text } : {}),
        ...(payloadCopy.ai_theme_text ? { ai_theme_text: payloadCopy.ai_theme_text } : {}),
        ...(payloadCopy.review_packet ? { review_packet: payloadCopy.review_packet } : {}),
        ...(payloadCopy.generated_review ? { generated_review: payloadCopy.generated_review } : {}),
        ...(payloadCopy.model_id ? { model_id: payloadCopy.model_id } : {}),
        ...(payloadCopy.prompt_version ? { prompt_version: payloadCopy.prompt_version } : {}),
        ...(payloadCopy.skill_versions ? { skill_versions: payloadCopy.skill_versions } : {}),
        ...(payloadCopy.atlas_policy_version
          ? { atlas_policy_version: payloadCopy.atlas_policy_version }
          : {}),
      };
      const versions: HistoryVersions = {
        history_schema: HISTORY_SCHEMA_VERSION,
        contracts: CONTRACTS_VERSION,
        rational_analysis: payloadCopy.rational_analysis_version,
        theme_narrative: historyRecord.theme_narrative_version,
        ...(historyRecord.review_packet ? { review_packet: REVIEW_PACKET_SCHEMA_VERSION } : {}),
        ...(historyRecord.generated_review
          ? { generated_daily_review: GENERATED_DAILY_REVIEW_SCHEMA_VERSION }
          : {}),
        ...(historyRecord.prompt_version ? { prompt: historyRecord.prompt_version } : {}),
        ...(historyRecord.atlas_policy_version
          ? { atlas_policy: historyRecord.atlas_policy_version }
          : {}),
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
      if (!recordIsValid(historyRecord, envelope)) throw new HistorySaveError("invalid_result");
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
