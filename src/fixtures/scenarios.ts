/**
 * Deterministic Demo V1 fixtures.
 * All holdings are fictional minimal examples, not real private portfolios.
 * These are NOT PandaAI/Bocha caches or live market data.
 */

import type {
  AnalysisResult,
  PortfolioSnapshot,
} from "../contracts/index.js";
import { CONTRACTS_VERSION } from "../contracts/index.js";

export type FixtureScenarioId =
  | "supported_full"
  | "limited_partial"
  | "observation_only_gaps"
  | "unavailable_no_evidence";

export interface AnalysisFixture {
  /** Stable scenario key. */
  scenario_id: FixtureScenarioId;
  /** Deterministic seed label for documentation/replay. */
  seed: string;
  contracts_version: typeof CONTRACTS_VERSION;
  label: string;
  /** Explicit example marker — fixtures are never live market claims. */
  is_example: true;
  example_label: "示例数据";
  snapshot: PortfolioSnapshot;
  analysis: AnalysisResult;
}

const THEME = "eastern_observation";
const TRADING_DAY = "2026-07-23";
const CUTOFF = "2026-07-23T15:00:00+08:00";
const STARTED = "2026-07-24T09:00:00+08:00";
const COMPLETED = "2026-07-24T09:00:45+08:00";

const baseConstraints = {
  investment_horizon: "3-5年",
  near_term_liquidity: "unknown" as const,
  tolerable_drawdown: "中等",
  investment_objective: "稳健增长",
};

const lineA = {
  line_id: "line-etf-300",
  asset_class: "etf" as const,
  name: "示例沪深300ETF",
  symbol: "510300.SH",
  market: "SH",
  size_basis: "示例持仓规模：中等",
  observation_date: TRADING_DAY,
  entry_method: "example" as const,
  confirmed_at: "2026-07-24T08:50:00+08:00",
};

const lineB = {
  line_id: "line-fund-demo",
  asset_class: "fund" as const,
  name: "示例债券基金",
  symbol: "000001.OF",
  size_basis: "示例持仓规模：较小",
  observation_date: TRADING_DAY,
  entry_method: "example" as const,
  confirmed_at: "2026-07-24T08:50:00+08:00",
};

function snapshot(snapshotId: string, lines: PortfolioSnapshot['lines']): PortfolioSnapshot {
  return {
    snapshot_id: snapshotId,
    created_at: "2026-07-24T08:55:00+08:00",
    contracts_version: CONTRACTS_VERSION,
    theme_id: THEME,
    lines,
    constraints: baseConstraints,
  };
}

function baseAnalysis(
  partial: Pick<
    AnalysisResult,
    | "analysis_id"
    | "snapshot_id"
    | "status"
    | "coverage"
    | "conclusions"
    | "advice"
    | "evidence"
    | "derived"
    | "unknowns"
    | "assumptions"
    | "limitations"
    | "risk_notes"
    | "recovery_actions"
  >,
): AnalysisResult {
  return {
    contracts_version: CONTRACTS_VERSION,
    analysis_started_at: STARTED,
    analysis_completed_at: COMPLETED,
    latest_complete_trading_day: TRADING_DAY,
    evidence_cutoff_at: CUTOFF,
    theme_id: THEME,
    constraints: baseConstraints,
    ...partial,
  };
}

export const FIXTURES: Record<FixtureScenarioId, AnalysisFixture> = {
  supported_full: {
    scenario_id: "supported_full",
    seed: "demo-v1-supported-001",
    contracts_version: CONTRACTS_VERSION,
    label: "全部持仓与证据可用（示例）",
    is_example: true,
    example_label: "示例数据",
    snapshot: snapshot("snap-supported-001", [lineA, lineB]),
    analysis: baseAnalysis({
      analysis_id: "analysis-supported-001",
      snapshot_id: "snap-supported-001",
      status: "supported",
      coverage: {
        covered_line_ids: [lineA.line_id, lineB.line_id],
        uncovered_line_ids: [],
        unsupported_line_ids: [],
        missing_metrics: [],
      },
      evidence: [
        {
          id: "ev-etf-close",
          scope: { kind: "asset", line_id: lineA.line_id, symbol: lineA.symbol },
          metric_or_event_type: "close",
          value: "示例收盘观察",
          unit: "CNY",
          source: {
            name: "fixture-structured",
            locator: "fixture://supported_full/etf-close",
          },
          observation_or_event_time: `${TRADING_DAY}T15:00:00+08:00`,
          fetched_at: "2026-07-24T08:58:00+08:00",
          status: "available",
          limitations: [],
          provenance: "observed",
        },
        {
          id: "ev-fund-nav",
          scope: { kind: "asset", line_id: lineB.line_id, symbol: lineB.symbol },
          metric_or_event_type: "nav",
          value: "示例净值观察",
          unit: "CNY",
          source: {
            name: "fixture-structured",
            locator: "fixture://supported_full/fund-nav",
          },
          observation_or_event_time: `${TRADING_DAY}T15:00:00+08:00`,
          fetched_at: "2026-07-24T08:58:10+08:00",
          status: "available",
          limitations: [],
          provenance: "observed",
        },
      ],
      derived: [
        {
          id: "der-exposure-equity",
          label: "权益类暴露粗估",
          value: "中等",
          input_refs: [lineA.line_id],
          evidence_refs: ["ev-etf-close"],
          formula_or_rule: "confirmed lines + available closes -> qualitative exposure band",
          provenance: "derived",
        },
      ],
      conclusions: [
        {
          id: "con-main",
          statement: "示例组合在最新完整交易日具备可核对的结构化观察。",
          provenance: "generated",
          refs: [
            { ref_id: lineA.line_id, kind: "confirmed_input" },
            { ref_id: "ev-etf-close", kind: "evidence" },
            { ref_id: "der-exposure-equity", kind: "derived" },
          ],
          affected_by_unknowns: false,
        },
      ],
      advice: [
        {
          id: "adv-maintain",
          kind: "maintain_observation",
          statement: "维持观察，等待下一完整交易日证据更新。",
          trigger_refs: [
            { ref_id: "der-exposure-equity", kind: "derived" },
            { ref_id: "ev-etf-close", kind: "evidence" },
          ],
          urgency: "routine",
        },
      ],
      unknowns: [],
      assumptions: ["示例路径使用确定性 fixture，不是实时行情。"],
      limitations: [],
      risk_notes: [
        {
          id: "risk-boundary",
          statement: "满懂只提供方向性建议，不构成投资建议或收益保证。",
          is_boundary_notice: true,
        },
      ],
    }),
  },

  limited_partial: {
    scenario_id: "limited_partial",
    seed: "demo-v1-limited-001",
    contracts_version: CONTRACTS_VERSION,
    label: "部分资产不支持导致有限分析（示例）",
    is_example: true,
    example_label: "示例数据",
    snapshot: snapshot("snap-limited-001", [lineA, lineB]),
    analysis: baseAnalysis({
      analysis_id: "analysis-limited-001",
      snapshot_id: "snap-limited-001",
      status: "limited",
      coverage: {
        covered_line_ids: [lineA.line_id],
        uncovered_line_ids: [],
        unsupported_line_ids: [lineB.line_id],
        missing_metrics: ["fund.nav"],
      },
      evidence: [
        {
          id: "ev-etf-close-limited",
          scope: { kind: "asset", line_id: lineA.line_id, symbol: lineA.symbol },
          metric_or_event_type: "close",
          value: "示例收盘观察",
          unit: "CNY",
          source: {
            name: "fixture-structured",
            locator: "fixture://limited_partial/etf-close",
          },
          observation_or_event_time: `${TRADING_DAY}T15:00:00+08:00`,
          fetched_at: "2026-07-24T08:58:00+08:00",
          status: "available",
          limitations: [],
          provenance: "observed",
        },
        {
          id: "ev-fund-unsupported",
          scope: { kind: "asset", line_id: lineB.line_id, symbol: lineB.symbol },
          metric_or_event_type: "nav",
          value: null,
          source: {
            name: "fixture-structured",
            locator: "fixture://limited_partial/fund-nav",
          },
          observation_or_event_time: `${TRADING_DAY}T15:00:00+08:00`,
          fetched_at: "2026-07-24T08:58:10+08:00",
          status: "unsupported",
          limitations: ["场外基金路径在示例矩阵中标记为不支持，不制造当前净值。"],
          provenance: "observed",
        },
      ],
      derived: [
        {
          id: "der-partial-coverage",
          label: "覆盖率",
          value: "部分覆盖",
          input_refs: [lineA.line_id, lineB.line_id],
          evidence_refs: ["ev-etf-close-limited", "ev-fund-unsupported"],
          formula_or_rule: "supported lines / total confirmed lines",
          provenance: "derived",
        },
      ],
      conclusions: [
        {
          id: "con-limited",
          statement: "仅权益 ETF 观察可用，组合结论不得假装完整。",
          provenance: "generated",
          refs: [
            { ref_id: lineA.line_id, kind: "confirmed_input" },
            { ref_id: "ev-etf-close-limited", kind: "evidence" },
            { ref_id: "der-partial-coverage", kind: "derived" },
          ],
          affected_by_unknowns: true,
          limited_by: [lineB.line_id],
        },
      ],
      advice: [
        {
          id: "adv-wait",
          kind: "wait_for_data_confirmation",
          statement: "等待不支持资产的数据确认后再扩展结论。",
          trigger_refs: [
            { ref_id: "ev-fund-unsupported", kind: "evidence" },
            { ref_id: lineB.line_id, kind: "confirmed_input" },
          ],
          urgency: "attention",
        },
      ],
      unknowns: [
        {
          id: "unk-fund-nav",
          subject: lineB.line_id,
          reason: "unsupported",
          impact: "基金侧结论与组合完整度受限",
        },
      ],
      assumptions: [],
      limitations: ["不支持资产仍保留在覆盖清单，不静默消失。"],
      risk_notes: [
        {
          id: "risk-boundary",
          statement: "满懂只提供方向性建议，不构成投资建议或收益保证。",
          is_boundary_notice: true,
        },
      ],
    }),
  },

  observation_only_gaps: {
    scenario_id: "observation_only_gaps",
    seed: "demo-v1-observation-001",
    contracts_version: CONTRACTS_VERSION,
    label: "证据过期/冲突，仅观察（示例）",
    is_example: true,
    example_label: "示例数据",
    snapshot: snapshot("snap-observation-001", [lineA]),
    analysis: baseAnalysis({
      analysis_id: "analysis-observation-001",
      snapshot_id: "snap-observation-001",
      status: "observation_only",
      coverage: {
        covered_line_ids: [],
        uncovered_line_ids: [lineA.line_id],
        unsupported_line_ids: [],
        missing_metrics: ["close.fresh"],
      },
      evidence: [
        {
          id: "ev-stale-close",
          scope: { kind: "asset", line_id: lineA.line_id, symbol: lineA.symbol },
          metric_or_event_type: "close",
          value: "陈旧观察值",
          unit: "CNY",
          source: {
            name: "fixture-structured",
            locator: "fixture://observation_only/stale-close",
          },
          observation_or_event_time: "2026-07-20T15:00:00+08:00",
          fetched_at: "2026-07-24T08:58:00+08:00",
          status: "stale",
          limitations: ["观察日早于最新完整交易日，不得当作当前值。"],
          provenance: "observed",
        },
        {
          id: "ev-conflict-close",
          scope: { kind: "asset", line_id: lineA.line_id, symbol: lineA.symbol },
          metric_or_event_type: "close",
          value: "冲突观察值",
          unit: "CNY",
          source: {
            name: "fixture-alt-source",
            locator: "fixture://observation_only/conflict-close",
          },
          observation_or_event_time: `${TRADING_DAY}T15:00:00+08:00`,
          fetched_at: "2026-07-24T08:58:05+08:00",
          status: "conflicting",
          limitations: ["与 ev-stale-close 冲突，不静默挑选有利值。"],
          provenance: "observed",
          conflict_with: ["ev-stale-close"],
        },
      ],
      derived: [],
      conclusions: [
        {
          id: "con-observe",
          statement: "仅能记录过期与冲突观察，不能形成方向性建议。",
          provenance: "generated",
          refs: [
            { ref_id: "ev-stale-close", kind: "evidence" },
            { ref_id: "ev-conflict-close", kind: "evidence" },
          ],
          affected_by_unknowns: true,
        },
      ],
      advice: [],
      unknowns: [
        {
          id: "unk-fresh-close",
          subject: lineA.line_id,
          reason: "stale+conflicting",
          impact: "无法支持物质性方向建议",
        },
      ],
      assumptions: [],
      limitations: ["observation_only 路径禁止把摘要或冲突值写成当前事实。"],
      risk_notes: [
        {
          id: "risk-boundary",
          statement: "满懂只提供方向性建议，不构成投资建议或收益保证。",
          is_boundary_notice: true,
        },
      ],
    }),
  },

  unavailable_no_evidence: {
    scenario_id: "unavailable_no_evidence",
    seed: "demo-v1-unavailable-001",
    contracts_version: CONTRACTS_VERSION,
    label: "供应商失败导致不可用（示例）",
    is_example: true,
    example_label: "示例数据",
    snapshot: snapshot("snap-unavailable-001", [lineA]),
    analysis: baseAnalysis({
      analysis_id: "analysis-unavailable-001",
      snapshot_id: "snap-unavailable-001",
      status: "unavailable",
      coverage: {
        covered_line_ids: [],
        uncovered_line_ids: [lineA.line_id],
        unsupported_line_ids: [],
        missing_metrics: ["close"],
      },
      evidence: [
        {
          id: "ev-failed-fetch",
          scope: { kind: "asset", line_id: lineA.line_id, symbol: lineA.symbol },
          metric_or_event_type: "close",
          value: null,
          source: {
            name: "fixture-structured",
            locator: "fixture://unavailable/failed-fetch",
          },
          observation_or_event_time: `${TRADING_DAY}T15:00:00+08:00`,
          fetched_at: "2026-07-24T08:59:00+08:00",
          status: "failed",
          limitations: ["获取失败，不制造当前值，不生成复盘报告。"],
          provenance: "observed",
        },
      ],
      derived: [],
      conclusions: [],
      advice: [],
      unknowns: [
        {
          id: "unk-all",
          subject: lineA.line_id,
          reason: "failed",
          impact: "无法形成可展示的复盘报告",
        },
      ],
      assumptions: [],
      limitations: ["unavailable 必须展示原因与恢复路径。"],
      risk_notes: [
        {
          id: "risk-boundary",
          statement: "满懂只提供方向性建议，不构成投资建议或收益保证。",
          is_boundary_notice: true,
        },
      ],
      recovery_actions: ["稍后重试结构化数据获取", "检查供应商权限与网络后重新生成"],
    }),
  },
};

export const FIXTURE_INDEX = Object.values(FIXTURES).map((fixture) => ({
  scenario_id: fixture.scenario_id,
  seed: fixture.seed,
  contracts_version: fixture.contracts_version,
  label: fixture.label,
  status: fixture.analysis.status,
  is_example: fixture.is_example,
}));
