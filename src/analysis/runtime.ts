import {
  CONTRACTS_VERSION,
  EVIDENCE_STATUSES,
  type AnalysisResult,
  type EvidenceRecord,
  type PersonalConstraints,
  type PortfolioSnapshot,
} from "../contracts/index.js";
import { hasPrivatePayload } from "../model/index.js";
import type { AnalysisDerivations } from "./derivations.js";

export const UNKNOWN_CONSTRAINTS: PersonalConstraints = {
  investment_horizon: "unknown",
  near_term_liquidity: "unknown",
  tolerable_drawdown: "unknown",
  investment_objective: "unknown",
};

export class RunInterrupted extends Error {
  constructor(readonly reason: "cancelled" | "deadline") {
    super(reason);
  }
}

export function semanticIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function isoDateTime(value: string): boolean {
  return value.includes("T") && !Number.isNaN(Date.parse(value));
}

export function freezeSnapshot(snapshot: PortfolioSnapshot): PortfolioSnapshot {
  const frozen: PortfolioSnapshot = {
    snapshot_id: snapshot.snapshot_id,
    created_at: snapshot.created_at,
    contracts_version: snapshot.contracts_version,
    theme_id: snapshot.theme_id,
    lines: snapshot.lines.map((line) => ({
      line_id: line.line_id,
      asset_class: line.asset_class,
      name: line.name,
      symbol: line.symbol,
      ...(line.market ? { market: line.market } : {}),
      size_basis: line.size_basis,
      observation_date: line.observation_date,
      entry_method: line.entry_method,
      confirmed_at: line.confirmed_at,
    })),
    constraints: { ...snapshot.constraints },
  };
  return Object.freeze({
    ...frozen,
    lines: Object.freeze(frozen.lines.map((line) => Object.freeze(line))) as unknown as PortfolioSnapshot["lines"],
    constraints: Object.freeze(frozen.constraints),
  });
}

export function safeFailureEvidence(input: {
  id: string;
  lineId: string;
  symbol: string;
  type: string;
  source: string;
  time: string;
  fetchedAt: string;
  limitation: string;
}): EvidenceRecord {
  return {
    id: input.id,
    scope: { kind: "asset", line_id: input.lineId, symbol: input.symbol },
    metric_or_event_type: input.type,
    value: null,
    source: { name: input.source, locator: `${input.source}:${input.lineId}` },
    observation_or_event_time: input.time,
    fetched_at: input.fetchedAt,
    status: "failed",
    limitations: [input.limitation],
    provenance: "observed",
  };
}

export function safeEvidenceBatch(
  value: unknown,
  cutoffAt: string,
  expectedAsset: { lineId: string; symbol: string },
): value is EvidenceRecord[] {
  if (!Array.isArray(value) || value.length === 0 || hasPrivatePayload(value)) return false;
  return value.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const evidence = item as Partial<EvidenceRecord>;
    const observation = evidence.observation_or_event_time;
    const source = evidence.source as { name?: unknown; locator?: unknown } | undefined;
    const scope = evidence.scope as {
      kind?: unknown;
      line_id?: unknown;
      constraint_key?: unknown;
      symbol?: unknown;
    } | undefined;
    const evidenceKeys = new Set([
      "id", "scope", "metric_or_event_type", "value", "unit", "normalization_note", "source",
      "observation_or_event_time", "fetched_at", "status", "limitations", "provenance", "conflict_with",
    ]);
    if (Object.keys(evidence).some((key) => !evidenceKeys.has(key))) return false;
    if (!source || Object.keys(source).some((key) => key !== "name" && key !== "locator")) return false;
    if (!scope || Object.keys(scope).some((key) => !["kind", "line_id", "symbol"].includes(key))) return false;
    return typeof evidence.id === "string" && evidence.id.length > 0 &&
      typeof evidence.metric_or_event_type === "string" &&
      (evidence.value === undefined || evidence.value === null ||
        typeof evidence.value === "string" ||
        (typeof evidence.value === "number" && Number.isFinite(evidence.value))) &&
      (evidence.status !== "available" || (evidence.value !== undefined && evidence.value !== null)) &&
      (evidence.unit === undefined || typeof evidence.unit === "string") &&
      (evidence.normalization_note === undefined || typeof evidence.normalization_note === "string") &&
      (evidence.conflict_with === undefined ||
        (Array.isArray(evidence.conflict_with) && evidence.conflict_with.every((item) => typeof item === "string"))) &&
      typeof observation === "string" &&
      (semanticIsoDate(observation) || isoDateTime(observation)) &&
      Date.parse(semanticIsoDate(observation) ? `${observation}T00:00:00.000Z` : observation) <= Date.parse(cutoffAt) &&
      typeof evidence.fetched_at === "string" && isoDateTime(evidence.fetched_at) &&
      typeof evidence.status === "string" && (EVIDENCE_STATUSES as readonly string[]).includes(evidence.status) &&
      Array.isArray(evidence.limitations) && evidence.limitations.every((item) => typeof item === "string") &&
      (evidence.status === "available" || evidence.value === undefined || evidence.value === null || evidence.limitations.length > 0) &&
      evidence.provenance === "observed" &&
      typeof source?.name === "string" && source.name.length > 0 &&
      typeof source.locator === "string" && source.locator.length > 0 &&
      scope?.kind === "asset" &&
      scope.line_id === expectedAsset.lineId &&
      (scope.symbol === undefined || scope.symbol === expectedAsset.symbol);
  });
}

export function fallbackAnalysis(input: {
  analysisId: string;
  snapshotId: string;
  constraints: PersonalConstraints;
  themeId: string;
  startedAt: string;
  completedAt: string;
  latestTradingDay: string;
  cutoffAt: string;
  evidence: EvidenceRecord[];
  derivations?: AnalysisDerivations;
  reason: string;
  unavailable: boolean;
}): AnalysisResult {
  const derivations = input.derivations ?? {
    status: "unavailable" as const,
    coverage: { covered_line_ids: [], uncovered_line_ids: [], unsupported_line_ids: [], missing_metrics: [] },
    derived: [], unknowns: [], limitations: [],
  };
  const firstEvidence = input.evidence.find((item) => item.status === "available" && item.metric_or_event_type !== "candidate_event");
  const firstLineId = derivations.coverage.covered_line_ids[0] ?? derivations.coverage.uncovered_line_ids[0];
  const reference = firstEvidence
    ? { ref_id: firstEvidence.id, kind: "evidence" as const }
    : firstLineId
      ? { ref_id: firstLineId, kind: "confirmed_input" as const }
      : undefined;
  const unavailable = input.unavailable || !reference;
  const status = unavailable
    ? "unavailable"
    : derivations.status === "observation_only"
      ? "observation_only"
      : "limited";
  return {
    contracts_version: CONTRACTS_VERSION,
    analysis_id: input.analysisId,
    snapshot_id: input.snapshotId,
    status,
    analysis_started_at: input.startedAt,
    analysis_completed_at: input.completedAt,
    latest_complete_trading_day: input.latestTradingDay,
    evidence_cutoff_at: input.cutoffAt,
    theme_id: input.themeId,
    coverage: derivations.coverage,
    constraints: input.constraints,
    conclusions: reference && !unavailable ? [{
      id: "deterministic-safe-conclusion",
      statement: "当前仅保留已确认输入和可核验证据范围，未完成部分不作推断。",
      provenance: firstEvidence ? "observed" : "derived",
      refs: [reference],
      affected_by_unknowns: true,
      limited_by: [input.reason],
    }] : [],
    advice: reference && !unavailable ? [{
      id: "deterministic-wait-for-confirmation",
      kind: "wait_for_data_confirmation",
      statement: "等待数据或生成能力恢复后再形成完整判断。",
      trigger_refs: [reference],
      urgency: "routine",
    }] : [],
    evidence: input.evidence,
    derived: derivations.derived,
    unknowns: derivations.unknowns,
    assumptions: [],
    limitations: [...derivations.limitations, input.reason],
    risk_notes: [{
      id: "standard-boundary-notice",
      statement: "本结果不构成投资建议，用户保留最终判断和操作权。",
      is_boundary_notice: true,
    }],
    ...(unavailable ? { recovery_actions: ["保留本次快照，确认数据与模型服务可用后重新发起复盘。"] } : {}),
  };
}

export function uniqueEvidence(evidence: readonly EvidenceRecord[]): EvidenceRecord[] {
  const byId = new Map<string, EvidenceRecord>();
  for (const item of evidence) {
    if (byId.has(item.id)) {
      throw new Error(`Duplicate evidence id rejected: ${item.id}`);
    }
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function omitDuplicateEvidenceIds(evidence: readonly EvidenceRecord[]): EvidenceRecord[] {
  const counts = new Map<string, number>();
  for (const item of evidence) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  return evidence.filter((item) => counts.get(item.id) === 1);
}

export function normalizeMarketEvidenceDates(
  evidence: readonly EvidenceRecord[],
  latestCompleteTradingDay: string,
): EvidenceRecord[] {
  return evidence.map((item) => {
    if (
      (item.metric_or_event_type === "close" || item.metric_or_event_type === "nav") &&
      item.status === "available" &&
      (!item.unit?.trim() || item.unit.trim().toLowerCase() === "unknown" || item.unit.trim() === "未知")
    ) {
      return {
        ...item,
        status: "ambiguous",
        limitations: [
          ...item.limitations,
          "结构化市场值的单位尚未核验，不得支持物质性结论。",
        ],
      };
    }
    if (
      item.metric_or_event_type !== "close" ||
      item.status !== "available" ||
      item.observation_or_event_time.slice(0, 10) === latestCompleteTradingDay
    ) {
      return item;
    }
    return {
      ...item,
      status: "stale",
      limitations: [
        ...item.limitations,
        `收盘观察日不是冻结的最新完整交易日 ${latestCompleteTradingDay}，不得支持物质性结论。`,
      ],
    };
  });
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function interruption(signal: AbortSignal, reason: () => "cancelled" | "deadline" | undefined): RunInterrupted {
  return new RunInterrupted(reason() ?? (signal.aborted ? "cancelled" : "deadline"));
}

export async function raceWithAbort<T>(
  work: Promise<T>,
  signal: AbortSignal,
  reason: () => "cancelled" | "deadline" | undefined,
): Promise<T> {
  if (signal.aborted) throw interruption(signal, reason);
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(interruption(signal, reason));
    signal.addEventListener("abort", aborted, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
  });
}
