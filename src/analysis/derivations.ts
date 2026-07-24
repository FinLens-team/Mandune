import type {
  AnalysisResultStatus,
  CoverageReport,
  DerivedResult,
  EvidenceRecord,
  PortfolioSnapshot,
  UnknownItem,
  UnknownFieldState,
} from "../contracts/index.js";

export interface DerivationInput {
  snapshot: PortfolioSnapshot;
  evidence: readonly EvidenceRecord[];
  latestCompleteTradingDay: string;
}

export interface AnalysisDerivations {
  status: AnalysisResultStatus;
  coverage: CoverageReport;
  derived: DerivedResult[];
  unknowns: UnknownItem[];
  limitations: string[];
}

const CONSTRAINT_KEYS = [
  "investment_horizon",
  "near_term_liquidity",
  "tolerable_drawdown",
  "investment_objective",
] as const;

const STRUCTURED_MARKET_METRICS = new Set(["close", "nav"]);
const OBSERVABLE_EVIDENCE_STATUSES = new Set(["available", "stale", "ambiguous", "conflicting", "unverified"]);

function semanticDate(value: string): string | undefined {
  const date = value.includes("T") ? value.slice(0, 10) : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return parsed.toISOString().slice(0, 10) === date ? date : undefined;
}

function isUnknown(value: string | UnknownFieldState): value is UnknownFieldState {
  return value === "unknown" || value === "not_decided";
}

function isMateriallyAvailable(evidence: EvidenceRecord, latestTradingDay: string): boolean {
  if (evidence.status !== "available" || evidence.provenance !== "observed") return false;
  if (!STRUCTURED_MARKET_METRICS.has(evidence.metric_or_event_type)) return false;
  if (!evidence.unit?.trim() || evidence.unit.trim().toLowerCase() === "unknown" || evidence.unit.trim() === "未知") return false;
  const observationDate = semanticDate(evidence.observation_or_event_time);
  if (!observationDate) return false;
  if (evidence.metric_or_event_type === "close" && observationDate !== latestTradingDay) return false;
  return true;
}

function assetLineId(evidence: EvidenceRecord): string | undefined {
  return evidence.scope.kind === "asset" ? evidence.scope.line_id : undefined;
}

function declaredPercentage(value: string): number | undefined {
  const match = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(value);
  if (!match?.[1]) return undefined;
  const percentage = Number(match[1]);
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100 ? percentage : undefined;
}

function deriveStatus(
  lineCount: number,
  coveredCount: number,
  evidenceCount: number,
  unknownConstraintCount: number,
): AnalysisResultStatus {
  if (evidenceCount === 0) return "unavailable";
  if (coveredCount === 0) return "observation_only";
  if (coveredCount < lineCount || unknownConstraintCount > 0) return "limited";
  return "supported";
}

export function deriveAnalysisInputs(input: DerivationInput): AnalysisDerivations {
  const evidence = [...input.evidence].sort((left, right) => left.id.localeCompare(right.id));
  const availableByLine = new Set(
    evidence
      .filter((item) => isMateriallyAvailable(item, input.latestCompleteTradingDay))
      .map(assetLineId)
      .filter((lineId): lineId is string => lineId !== undefined),
  );
  const unsupportedByLine = new Set(
    evidence
      .filter((item) => item.status === "unsupported")
      .map(assetLineId)
      .filter((lineId): lineId is string => lineId !== undefined),
  );

  const covered = input.snapshot.lines
    .map((line) => line.line_id)
    .filter((lineId) => availableByLine.has(lineId));
  const uncovered = input.snapshot.lines
    .map((line) => line.line_id)
    .filter((lineId) => !availableByLine.has(lineId));
  const unsupported = uncovered.filter((lineId) => unsupportedByLine.has(lineId));

  const unknowns: UnknownItem[] = [];
  for (const key of CONSTRAINT_KEYS) {
    if (isUnknown(input.snapshot.constraints[key])) {
      unknowns.push({
        id: `unknown-constraint-${key}`,
        subject: key,
        reason: `约束为 ${input.snapshot.constraints[key]}。`,
        impact: "依赖该约束的个性化判断不得形成。",
      });
    }
  }
  for (const lineId of uncovered) {
    unknowns.push({
      id: `unknown-coverage-${lineId}`,
      subject: lineId,
      reason: unsupportedByLine.has(lineId) ? "当前数据路径不支持该持仓。" : "没有可支持物质性结论的已核验证据。",
      impact: "该持仓不计入完整组合结论。",
    });
  }

  const classCounts = new Map<string, number>();
  for (const line of input.snapshot.lines) {
    classCounts.set(line.asset_class, (classCounts.get(line.asset_class) ?? 0) + 1);
  }
  const coverageCount: DerivedResult = {
    id: "coverage-covered-line-count",
    label: "有可用证据的持仓数量",
    value: covered.length,
    unit: "line",
    input_refs: input.snapshot.lines.map((line) => line.line_id),
    evidence_refs: evidence.filter((item) =>
      isMateriallyAvailable(item, input.latestCompleteTradingDay)).map((item) => item.id),
    formula_or_rule: "Count distinct confirmed line ids with available, time-valid, non-candidate evidence.",
    provenance: "derived",
  };
  const declaredShares = input.snapshot.lines.map((line) => ({
    lineId: line.line_id,
    value: declaredPercentage(line.size_basis),
  }));
  const percentageDerivations: DerivedResult[] = declaredShares.every((item) => item.value !== undefined)
    ? [
        ...declaredShares.map<DerivedResult>((item) => ({
          id: `exposure-declared-share-${item.lineId}`,
          label: `${item.lineId} 的已确认持仓占比`,
          value: item.value!,
          unit: "%",
          input_refs: [item.lineId],
          evidence_refs: [],
          formula_or_rule: "Parse an exact percentage from the user-confirmed size_basis; no recommendation threshold is applied.",
          provenance: "derived",
        })),
        {
          id: "exposure-declared-share-total",
          label: "已确认持仓占比合计",
          value: declaredShares.reduce((total, item) => total + item.value!, 0),
          unit: "%",
          input_refs: declaredShares.map((item) => item.lineId),
          evidence_refs: [],
          formula_or_rule: "Sum exact percentages parsed from every user-confirmed size_basis.",
          provenance: "derived",
        },
      ]
    : [];
  const derived: DerivedResult[] = [
    coverageCount,
    ...percentageDerivations,
    ...[...classCounts.entries()].map<DerivedResult>(([assetClass, count]) => ({
      id: `exposure-asset-class-count-${assetClass}`,
      label: `${assetClass} 持仓数量`,
      value: count,
      unit: "line",
      input_refs: input.snapshot.lines.filter((line) => line.asset_class === assetClass).map((line) => line.line_id),
      evidence_refs: [],
      formula_or_rule: `Count confirmed holdings whose asset_class equals ${assetClass}.`,
      provenance: "derived",
    })),
    ...CONSTRAINT_KEYS.map<DerivedResult>((key) => ({
      id: `constraint-known-${key}`,
      label: `${key} 是否已确认`,
      value: !isUnknown(input.snapshot.constraints[key]),
      input_refs: [`constraint:${key}`],
      evidence_refs: [],
      formula_or_rule: "A constraint is known only when it is neither unknown nor not_decided.",
      provenance: "derived",
    })),
    ...CONSTRAINT_KEYS.flatMap<DerivedResult>((key) => {
      const value = input.snapshot.constraints[key];
      return isUnknown(value) ? [] : [{
        id: `constraint-value-${key}`,
        label: `${key} 的已确认值`,
        value,
        input_refs: [`constraint:${key}`],
        evidence_refs: [],
        formula_or_rule: "Copy the user-confirmed constraint value without inference or defaulting.",
        provenance: "derived",
      }];
    }),
  ].sort((left, right) => left.id.localeCompare(right.id));

  const missingMetrics = uncovered.map((lineId) => `${lineId}:material_evidence`);
  const observableEvidenceCount = evidence.filter((item) => OBSERVABLE_EVIDENCE_STATUSES.has(item.status)).length;
  const status = deriveStatus(
    input.snapshot.lines.length,
    covered.length,
    observableEvidenceCount,
    unknowns.filter((item) => item.id.startsWith("unknown-constraint-")).length,
  );
  const limitations = [
    ...(uncovered.length > 0 ? ["部分持仓缺少可支持物质性结论的证据。"] : []),
    ...(unknowns.some((item) => item.id.startsWith("unknown-constraint-"))
      ? ["至少一项个人约束未知，相关个性化判断已缩小。"]
      : []),
  ];

  return {
    status,
    coverage: {
      covered_line_ids: covered,
      uncovered_line_ids: uncovered,
      unsupported_line_ids: unsupported,
      missing_metrics: missingMetrics,
    },
    derived,
    unknowns,
    limitations,
  };
}
