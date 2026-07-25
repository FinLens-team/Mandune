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

interface DailyChange {
  lineId: string;
  percentage: number;
  evidenceRefs: [string, string];
}

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

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function dailyChanges(evidence: readonly EvidenceRecord[], latestTradingDay: string): DailyChange[] {
  const byLine = new Map<string, EvidenceRecord[]>();
  for (const item of evidence) {
    const lineId = assetLineId(item);
    if (!lineId || typeof item.value !== "number" || !Number.isFinite(item.value)) continue;
    if (item.metric_or_event_type !== "close" && item.metric_or_event_type !== "nav") continue;
    const eligible = item.status === "available" ||
      (item.status === "ambiguous" && item.normalization_note === "unitless_return_eligible:same_provider_method");
    if (!eligible || !semanticDate(item.observation_or_event_time)) continue;
    const rows = byLine.get(lineId) ?? [];
    rows.push(item);
    byLine.set(lineId, rows);
  }

  const result: DailyChange[] = [];
  for (const [lineId, rows] of byLine) {
    const current = rows.find((item) => semanticDate(item.observation_or_event_time) === latestTradingDay);
    if (!current || typeof current.value !== "number") continue;
    const previous = rows
      .filter((item) =>
        item.metric_or_event_type === current.metric_or_event_type &&
        item.source.name === current.source.name &&
        semanticDate(item.observation_or_event_time)! < latestTradingDay &&
        typeof item.value === "number")
      .sort((left, right) => right.observation_or_event_time.localeCompare(left.observation_or_event_time))[0];
    if (!previous || typeof previous.value !== "number" || previous.value === 0) continue;
    result.push({
      lineId,
      percentage: rounded(((current.value - previous.value) / Math.abs(previous.value)) * 100),
      evidenceRefs: [previous.id, current.id],
    });
  }
  return result.sort((left, right) => left.lineId.localeCompare(right.lineId));
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
  const changes = dailyChanges(evidence, input.latestCompleteTradingDay);
  const changeByLine = new Map(changes.map((item) => [item.lineId, item]));
  const availableByLine = new Set(
    evidence
      .filter((item) => isMateriallyAvailable(item, input.latestCompleteTradingDay))
      .map(assetLineId)
      .filter((lineId): lineId is string => lineId !== undefined),
  );
  for (const change of changes) availableByLine.add(change.lineId);
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
    evidence_refs: [
      ...evidence.filter((item) => isMateriallyAvailable(item, input.latestCompleteTradingDay)).map((item) => item.id),
      ...changes.flatMap((item) => item.evidenceRefs),
    ].sort(),
    formula_or_rule: "Count confirmed lines with time-valid market evidence or a unit-independent daily return derived from two observations from the same provider method.",
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
        ...[...new Set(input.snapshot.lines.map((line) => line.asset_class))].map<DerivedResult>((assetClass) => ({
          id: `exposure-asset-class-share-${assetClass}`,
          label: `${assetClass} 已确认持仓占比`,
          value: rounded(input.snapshot.lines.reduce((total, line, index) =>
            line.asset_class === assetClass ? total + declaredShares[index]!.value! : total, 0)),
          unit: "%",
          input_refs: input.snapshot.lines.filter((line) => line.asset_class === assetClass).map((line) => line.line_id),
          evidence_refs: [],
          formula_or_rule: `Sum exact user-confirmed percentages for lines whose asset_class equals ${assetClass}.`,
          provenance: "derived",
        })),
        {
          id: "concentration-top-1-share",
          label: "最大单项持仓占比",
          value: Math.max(...declaredShares.map((item) => item.value!)),
          unit: "%",
          input_refs: declaredShares.map((item) => item.lineId),
          evidence_refs: [],
          formula_or_rule: "Take the maximum exact percentage parsed from user-confirmed size_basis values.",
          provenance: "derived",
        },
        {
          id: "concentration-top-3-share",
          label: "前三项持仓占比",
          value: rounded(declaredShares.map((item) => item.value!).sort((left, right) => right - left)
            .slice(0, 3).reduce((total, value) => total + value, 0)),
          unit: "%",
          input_refs: declaredShares.map((item) => item.lineId),
          evidence_refs: [],
          formula_or_rule: "Sort exact user-confirmed percentages descending and sum the largest three.",
          provenance: "derived",
        },
        {
          id: "concentration-hhi",
          label: "持仓集中度 HHI",
          value: rounded(declaredShares.reduce((total, item) => total + item.value! ** 2, 0)),
          unit: "index",
          input_refs: declaredShares.map((item) => item.lineId),
          evidence_refs: [],
          formula_or_rule: "Sum the squares of exact user-confirmed percentage shares.",
          provenance: "derived",
        },
      ]
    : [];
  const dailyChangeDerivations = changes.map<DerivedResult>((change) => ({
    id: `daily-change-pct-${change.lineId}`,
    label: `${change.lineId} 最新完整交易日涨跌幅`,
    value: change.percentage,
    unit: "%",
    input_refs: [change.lineId],
    evidence_refs: change.evidenceRefs,
    formula_or_rule: "(current provider-native observation - previous observation) / abs(previous observation) * 100; both observations use the same provider method and metric.",
    provenance: "derived",
  }));
  const contributionDerivations: DerivedResult[] = declaredShares.every((item) => item.value !== undefined)
    ? declaredShares.flatMap<DerivedResult>((share) => {
        const change = changeByLine.get(share.lineId);
        return change ? [{
          id: `daily-contribution-pct-point-${share.lineId}`,
          label: `${share.lineId} 当日组合贡献`,
          value: rounded((share.value! * change.percentage) / 100),
          unit: "percentage_point",
          input_refs: [share.lineId],
          evidence_refs: change.evidenceRefs,
          formula_or_rule: "user-confirmed holding percentage * unit-independent daily return / 100.",
          provenance: "derived",
        }] : [];
      })
    : [];
  const contributionSummary: DerivedResult[] = contributionDerivations.length > 0
    ? [
        {
          id: "daily-portfolio-change-pct",
          label: "组合当日估算涨跌幅",
          value: rounded(contributionDerivations.reduce((total, item) => total + Number(item.value), 0)),
          unit: "%",
          input_refs: contributionDerivations.flatMap((item) => item.input_refs),
          evidence_refs: [...new Set(contributionDerivations.flatMap((item) => item.evidence_refs))].sort(),
          formula_or_rule: "Sum each line's percentage-point contribution from exact user-confirmed holding percentages.",
          provenance: "derived",
        },
        {
          id: "daily-largest-contributor-line",
          label: "当日最大贡献持仓",
          value: contributionDerivations.reduce((best, item) => Number(item.value) > Number(best.value) ? item : best)
            .input_refs[0] ?? null,
          input_refs: contributionDerivations.flatMap((item) => item.input_refs),
          evidence_refs: contributionDerivations.reduce((best, item) => Number(item.value) > Number(best.value) ? item : best)
            .evidence_refs,
          formula_or_rule: "Select the line with the greatest deterministic percentage-point contribution.",
          provenance: "derived",
        },
        {
          id: "daily-largest-detractor-line",
          label: "当日最大拖累持仓",
          value: contributionDerivations.reduce((worst, item) => Number(item.value) < Number(worst.value) ? item : worst)
            .input_refs[0] ?? null,
          input_refs: contributionDerivations.flatMap((item) => item.input_refs),
          evidence_refs: contributionDerivations.reduce((worst, item) => Number(item.value) < Number(worst.value) ? item : worst)
            .evidence_refs,
          formula_or_rule: "Select the line with the smallest deterministic percentage-point contribution.",
          provenance: "derived",
        },
      ]
    : [];
  const derived: DerivedResult[] = [
    coverageCount,
    ...percentageDerivations,
    ...dailyChangeDerivations,
    ...contributionDerivations,
    ...contributionSummary,
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
