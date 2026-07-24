import {
  deriveAnalysisInputs,
  RATIONAL_ANALYSIS_SCHEMA_VERSION,
  THEME_NARRATIVE_SCHEMA_VERSION,
  validateOwnedAnalysisResult,
  validateThemeModelOutput,
  type RationalModelOutput,
  type ThemeModelOutput,
} from "../../analysis/index.js";
import {
  CONTRACTS_VERSION,
  type AnalysisResult,
  type MaterialReference,
  type PortfolioSnapshot,
} from "../../contracts/index.js";
import { getFixture, type FixtureScenarioId } from "../../fixtures/index.js";
import {
  FIXTURE_NON_LIVE_LABEL,
  type AnalysisExecution,
  type AnalysisExecutor,
} from "./types.js";

function resolveFixtureEvidence(
  scenarioId: FixtureScenarioId,
  snapshot: PortfolioSnapshot,
): { analysis: AnalysisResult } | null {
  const fixture = getFixture(scenarioId);
  const fixtureLines = new Map(
    fixture.snapshot.lines.map((line) => [`${line.line_id}\u0000${line.symbol}`, line]),
  );
  const requested = new Set(snapshot.lines.map((line) => line.line_id));
  if (!snapshot.lines.every((line) => fixtureLines.has(`${line.line_id}\u0000${line.symbol}`))) {
    return null;
  }

  const evidence = fixture.analysis.evidence.filter((item) =>
    item.scope.kind !== "asset" || requested.has(item.scope.line_id ?? ""));
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const fixtureDerived = fixture.analysis.derived.filter((item) =>
    item.input_refs.every((ref) => requested.has(ref)) &&
    item.evidence_refs.every((ref) => evidenceIds.has(ref)));
  const deterministic = deriveAnalysisInputs({
    snapshot,
    evidence,
    latestCompleteTradingDay: fixture.analysis.latest_complete_trading_day,
  });
  const derived = [...fixtureDerived, ...deterministic.derived.filter((item) =>
    !fixtureDerived.some((existing) => existing.id === item.id))];
  const derivedIds = new Set(derived.map((item) => item.id));
  const referenceExists = (ref: MaterialReference): boolean => {
    if (ref.kind === "confirmed_input") return requested.has(ref.ref_id);
    if (ref.kind === "evidence") return evidenceIds.has(ref.ref_id);
    return derivedIds.has(ref.ref_id);
  };
  const hasUnknownConstraints = deterministic.unknowns.some((item) => item.id.startsWith("unknown-constraint-"));
  const limitedBy = deterministic.unknowns.map((item) => item.id);
  const conclusions = deterministic.status === "unavailable" ? [] : fixture.analysis.conclusions
    .filter((item) => item.refs.every(referenceExists))
    .map((item) => hasUnknownConstraints ? {
      ...item,
      affected_by_unknowns: true,
      limited_by: [...new Set([...(item.limited_by ?? []), ...limitedBy])],
    } : item);
  const observationAdviceKinds = new Set([
    "maintain_observation",
    "wait_for_data_confirmation",
    "review_constraints",
    "seek_human_judgment",
  ]);
  let advice = deterministic.status === "unavailable" ? [] : fixture.analysis.advice
    .filter((item) => item.trigger_refs.every(referenceExists))
    .filter((item) => deterministic.status !== "observation_only" && !hasUnknownConstraints ||
      observationAdviceKinds.has(item.kind));
  if (deterministic.status === "observation_only" && advice.length === 0 && snapshot.lines[0]) {
    advice = [{
      id: "fixture-wait-for-data-confirmation",
      kind: "wait_for_data_confirmation",
      statement: "等待可核验数据补齐后再形成方向性判断。",
      trigger_refs: [{ ref_id: snapshot.lines[0].line_id, kind: "confirmed_input" }],
      urgency: "routine",
    }];
  }
  const analysis: AnalysisResult = {
    ...structuredClone(fixture.analysis),
    analysis_id: "pending",
    snapshot_id: snapshot.snapshot_id,
    theme_id: snapshot.theme_id,
    constraints: structuredClone(snapshot.constraints),
    status: deterministic.status,
    coverage: deterministic.coverage,
    evidence,
    derived,
    conclusions,
    advice,
    unknowns: deterministic.unknowns,
    assumptions: [
      ...fixture.analysis.assumptions,
      "本次使用同资产确定性 fixture，属于非实时示例路径。",
    ],
    limitations: [
      ...new Set([...fixture.analysis.limitations, ...deterministic.limitations]),
      "示例 fixture 不证明实时供应商可用，观察时间、获取时间与证据截止保持原记录。",
    ],
  };
  return { analysis };
}

function narrativeFor(analysis: AnalysisResult): ThemeModelOutput | undefined {
  if (analysis.status === "unavailable" || analysis.conclusions.length === 0 || analysis.advice.length === 0) {
    return undefined;
  }
  const narrative: ThemeModelOutput = {
    schema_version: THEME_NARRATIVE_SCHEMA_VERSION,
    rational_analysis_id: analysis.analysis_id,
    theme_id: analysis.theme_id,
    headline: "今日观象",
    body_paragraphs: analysis.conclusions.map((item) => item.statement),
    mascot_mood: "attentive",
    guidance_summary: analysis.advice.map((item) => item.statement).join("；"),
    conclusion_ids: analysis.conclusions.map((item) => item.id),
    advice_ids: analysis.advice.map((item) => item.id),
  };
  const rational: RationalModelOutput = {
    schema_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
    conclusions: analysis.conclusions,
    advice: analysis.advice,
    assumptions: analysis.assumptions,
    limitations: analysis.limitations,
    risk_notes: analysis.risk_notes,
  };
  return validateThemeModelOutput(narrative, rational, {
    analysisId: analysis.analysis_id,
    themeId: analysis.theme_id,
  }) ? narrative : undefined;
}

function unavailableExecution(
  analysisId: string,
  snapshot: PortfolioSnapshot,
  now: Date,
): AnalysisExecution {
  const timestamp = now.toISOString();
  const analysis: AnalysisResult = {
    contracts_version: CONTRACTS_VERSION,
    analysis_id: analysisId,
    snapshot_id: snapshot.snapshot_id,
    status: "unavailable",
    analysis_started_at: timestamp,
    analysis_completed_at: timestamp,
    latest_complete_trading_day: timestamp.slice(0, 10),
    evidence_cutoff_at: timestamp,
    theme_id: snapshot.theme_id,
    coverage: {
      covered_line_ids: [],
      uncovered_line_ids: snapshot.lines.map((line) => line.line_id),
      unsupported_line_ids: [],
      missing_metrics: ["same_asset_fixture"],
    },
    constraints: structuredClone(snapshot.constraints),
    conclusions: [],
    advice: [],
    evidence: [],
    derived: [],
    unknowns: snapshot.lines.map((line) => ({
      id: `unknown-${line.line_id}`,
      subject: line.line_id,
      reason: "no_exact_same_asset_fixture",
      impact: "没有同一确认行与代码的证据，不能形成物质性结论。",
    })),
    assumptions: [],
    limitations: ["实时路径当前不可用，且没有与全部确认行逐项匹配的非实时 fixture。"],
    risk_notes: [{
      id: "standard-boundary-notice",
      statement: "本结果不构成投资建议，用户保留最终判断和操作权。",
      is_boundary_notice: true,
    }],
    recovery_actions: ["恢复实时数据路径，或还原为具有同一行标识和资产代码的体验持仓后重试。"],
  };
  return {
    analysis,
    rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
    source: { kind: "unavailable", is_live: false, label: "无可用实时或同资产 fixture" },
  };
}

function stage(
  emit: Parameters<AnalysisExecutor["execute"]>[0]["emit"],
  name: Parameters<typeof emit>[0],
  message: string,
  work: () => void,
  coveredCount?: number,
): void {
  const count = coveredCount === undefined ? {} : { covered_count: coveredCount };
  emit(name, "pending", count);
  emit(name, "running", { ...count, message });
  work();
  emit(name, "succeeded", count);
}

export class FixtureAnalysisExecutor implements AnalysisExecutor {
  constructor(private readonly scenarioId: FixtureScenarioId = "supported_full") {}

  async execute(input: Parameters<AnalysisExecutor["execute"]>[0]): Promise<AnalysisExecution> {
    stage(input.emit, "validate_snapshot", "校验并冻结确认快照。", () => undefined);
    stage(input.emit, "resolve_assets", "解析已确认资产与覆盖范围。", () => undefined);

    let resolved: ReturnType<typeof resolveFixtureEvidence> = null;
    input.emit("fetch_structured_data", "pending");
    input.emit("fetch_structured_data", "running", { message: "逐项匹配非实时示例证据。" });
    resolved = resolveFixtureEvidence(this.scenarioId, input.snapshot);
    if (!resolved) {
      input.emit("fetch_structured_data", "failed", { message: "没有逐项匹配的同资产 fixture。" });
      stage(input.emit, "discover_and_verify_events", "确认当前无可用事件证据。", () => undefined, 0);
      stage(input.emit, "derive_exposure_and_constraints", "保持未覆盖资产与未知项。", () => undefined, 0);
      input.emit("form_conclusions_and_advice", "pending", { covered_count: 0 });
      input.emit("form_conclusions_and_advice", "failed", {
        covered_count: 0,
        message: "证据不足，不形成物质性结论。",
      });
      input.emit("render_theme_and_validate_output", "pending", { covered_count: 0 });
      input.emit("render_theme_and_validate_output", "failed", {
        covered_count: 0,
        message: "不可用结果不生成主题叙事。",
      });
      return unavailableExecution(input.analysisId, input.snapshot, input.now());
    }
    input.emit("fetch_structured_data", "succeeded", {
      covered_count: resolved.analysis.coverage.covered_line_ids.length,
    });
    const coveredCount = resolved.analysis.coverage.covered_line_ids.length;
    stage(input.emit, "discover_and_verify_events", "保留 fixture 已记录的来源状态。", () => undefined, coveredCount);
    stage(input.emit, "derive_exposure_and_constraints", "复核 fixture 的可复算覆盖。", () => undefined, coveredCount);
    stage(input.emit, "form_conclusions_and_advice", "装配同一证据版本的理性结果。", () => undefined, coveredCount);

    const startedAt = input.now().toISOString();
    const analysis: AnalysisResult = {
      ...resolved.analysis,
      analysis_id: input.analysisId,
      analysis_started_at: startedAt,
      analysis_completed_at: input.now().toISOString(),
    };
    if (!validateOwnedAnalysisResult(analysis).ok) {
      throw new Error("fixture_execution_failed_validation");
    }
    const narrative = narrativeFor(analysis);
    if (narrative) {
      stage(input.emit, "render_theme_and_validate_output", "校验同一理性结果的主题表达。", () => undefined, coveredCount);
    } else {
      input.emit("render_theme_and_validate_output", "pending", { covered_count: coveredCount });
      input.emit("render_theme_and_validate_output", "failed", {
        covered_count: coveredCount,
        message: "当前结果不生成主题叙事。",
      });
    }
    return {
      analysis,
      ...(narrative ? { narrative } : {}),
      rational_analysis_version: RATIONAL_ANALYSIS_SCHEMA_VERSION,
      source: { kind: "fixture", is_live: false, label: FIXTURE_NON_LIVE_LABEL },
    };
  }
}
