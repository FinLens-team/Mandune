import type { AnalysisResult, PortfolioSnapshot } from "../contracts/index.js";

export const SCORE_TIERS = ["夯", "顶级", "人上人", "NPC", "拉完了"] as const;

export type ScoreTier = (typeof SCORE_TIERS)[number];
export type ScoreDimensionId = "short_term" | "mid_term" | "risk" | "diversification";

export interface ScoreDimension {
  id: ScoreDimensionId;
  label: string;
  score: number;
  maxScore: number;
  summary: string;
}

export interface PortfolioScore {
  score: number;
  tier: ScoreTier;
  roast: string;
  dimensions: ScoreDimension[];
}

export interface PortfolioScoreInput {
  analysis: AnalysisResult;
  snapshot: PortfolioSnapshot;
}

export function portfolioScoreIsAvailable(input: PortfolioScoreInput): boolean {
  const ids = input.analysis.derived.map((item) => item.id);
  return ids.some((id) => id.includes("market-3-session-") && id.endsWith("-return-pct")) &&
    ids.some((id) => id.includes("market-1-month-") && id.endsWith("-return-pct")) &&
    ids.some((id) => id.includes("market-1-year-") && id.endsWith("-max-drawdown-pct"));
}


function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}


function parsePercent(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/u);
  if (!match?.[1]) return null;
  const percent = Number(match[1]);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null;
}

export function tierForScore(score: number): ScoreTier {
  if (score >= 8.5) return "夯";
  if (score >= 7.5) return "顶级";
  if (score >= 6) return "人上人";
  if (score >= 4) return "NPC";
  return "拉完了";
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function returnDimension(input: PortfolioScoreInput, horizon: "3-session" | "1-month"): ScoreDimension {
  const returns = input.analysis.derived
    .filter((item) => item.id.includes(`market-${horizon}-`) && item.id.endsWith("-return-pct") && typeof item.value === "number")
    .map((item) => Number(item.value));
  const mean = average(returns);
  const maxScore = 2.5;
  const score = mean === null ? maxScore * 0.5 : clamp(maxScore * (0.5 + mean / (horizon === "3-session" ? 10 : 30)), 0, maxScore);
  return {
    id: horizon === "3-session" ? "short_term" : "mid_term",
    label: horizon === "3-session" ? "短期表现" : "中期趋势",
    score: roundOne(score),
    maxScore,
    summary: mean === null ? "该周期暂无足够行情，按中性分处理" : `该周期持仓平均涨跌约 ${roundOne(mean)}%`,
  };
}

function riskDimension(input: PortfolioScoreInput): ScoreDimension {
  const drawdowns = input.analysis.derived
    .filter((item) => item.id.includes("market-1-year-") && item.id.endsWith("-max-drawdown-pct") && typeof item.value === "number")
    .map((item) => Math.abs(Number(item.value)));
  const mean = average(drawdowns);
  const score = mean === null ? 1.25 : clamp(2.5 * (1 - mean / 50), 0, 2.5);
  return {
    id: "risk",
    label: "回撤控制",
    score: roundOne(score),
    maxScore: 2.5,
    summary: mean === null ? "长期回撤样本不足，按中性分处理" : `近一年平均最大回撤约 ${roundOne(mean)}%`,
  };
}

function diversificationDimension(snapshot: PortfolioSnapshot): ScoreDimension {
  const lineCount = snapshot.lines.length;
  const classCount = new Set(snapshot.lines.map((line) => line.asset_class)).size;
  const parsedWeights = snapshot.lines.map((line) => parsePercent(line.size_basis));
  const knownWeights = parsedWeights.filter((weight): weight is number => weight !== null);
  const maxWeight = knownWeights.length === lineCount && lineCount > 0 ? Math.max(...knownWeights) : null;

  let score = 0;
  if (lineCount >= 4) score += 1.1;
  else if (lineCount >= 2) score += 0.8;
  else if (lineCount === 1) score += 0.3;

  if (classCount >= 3) score += 0.6;
  else if (classCount === 2) score += 0.4;
  else if (classCount === 1) score += 0.1;

  if (maxWeight !== null) {
    if (maxWeight <= 40) score += 0.3;
    else if (maxWeight <= 60) score += 0.15;
  } else if (lineCount >= 3) {
    score += 0.2;
  }

  const summary = maxWeight !== null && maxWeight > 60
    ? `最大单项占比约 ${roundOne(maxWeight)}%，结构偏集中`
    : lineCount <= 1
      ? "当前为单一标的，结构集中"
      : `${lineCount} 项持仓，覆盖 ${classCount} 类资产`;

  return {
    id: "diversification",
    label: "持仓结构",
    score: roundOne(clamp(score * 1.25, 0, 2.5)),
    maxScore: 2.5,
    summary,
  };
}

const ROASTS: Record<ScoreDimensionId, string> = {
  short_term: "短期节奏还没站稳，组合里有些标的正在互相抵消。",
  mid_term: "中期趋势分化明显，跑在前面的暂时没能带动整套组合。",
  risk: "收益故事先放一边，这套组合真正需要盯住的是回撤。",
  diversification: "这套阵容主角光环太重，配角存在感偏低。结构一抖，整仓都跟着晃。",
};

export function scorePortfolio(input: PortfolioScoreInput): PortfolioScore {
  const dimensions = [
    returnDimension(input, "3-session"),
    returnDimension(input, "1-month"),
    riskDimension(input),
    diversificationDimension(input.snapshot),
  ];
  const score = roundOne(clamp(dimensions.reduce((total, dimension) => total + dimension.score, 0), 0, 10));
  const weakest = [...dimensions].sort((left, right) =>
    left.score / left.maxScore - right.score / right.maxScore)[0]!;
  return {
    score,
    tier: tierForScore(score),
    roast: ROASTS[weakest.id],
    dimensions,
  };
}
