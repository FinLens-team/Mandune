import type { AnalysisResult, PortfolioSnapshot } from "../contracts/index.js";

export const SCORE_TIERS = ["夯", "顶级", "人上人", "NPC", "拉完了"] as const;

export type ScoreTier = (typeof SCORE_TIERS)[number];
export type ScoreDimensionId = "information" | "coverage" | "diversification" | "fit";

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

const UNKNOWN_VALUES = new Set(["unknown", "not_decided"]);

function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function known(value: string | undefined): boolean {
  return Boolean(value && !UNKNOWN_VALUES.has(value));
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

function informationDimension(snapshot: PortfolioSnapshot): ScoreDimension {
  const constraints = Object.values(snapshot.constraints);
  const knownConstraints = constraints.filter((value) => known(value)).length;
  const lineFields = snapshot.lines.flatMap((line) => [line.symbol, line.size_basis, line.observation_date]);
  const knownLineFields = lineFields.filter((value) => known(value)).length;
  const totalFields = constraints.length + lineFields.length;
  const knownFields = knownConstraints + knownLineFields;
  const score = totalFields === 0 ? 0 : roundOne(3 * knownFields / totalFields);
  return {
    id: "information",
    label: "信息完整度",
    score,
    maxScore: 3,
    summary: knownConstraints === constraints.length
      ? "关键约束与持仓信息已确认"
      : `仍有 ${constraints.length - knownConstraints} 项关键约束待确认`,
  };
}

function coverageDimension(input: PortfolioScoreInput): ScoreDimension {
  const total = input.snapshot.lines.length;
  const covered = new Set(input.analysis.coverage.covered_line_ids).size;
  const ratio = total === 0 ? 0 : clamp(covered / total, 0, 1);
  return {
    id: "coverage",
    label: "证据覆盖",
    score: roundOne(2.5 * ratio),
    maxScore: 2.5,
    summary: `${covered}/${total} 项持仓已有行情证据`,
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
    score: roundOne(clamp(score, 0, 2)),
    maxScore: 2,
    summary,
  };
}

function fitDimension(input: PortfolioScoreInput): ScoreDimension {
  const values = Object.values(input.snapshot.constraints);
  const knownCount = values.filter((value) => known(value)).length;
  const unknownPenalty = (values.length - knownCount) * 0.4;
  const concentration = diversificationDimension(input.snapshot);
  const structurePenalty = concentration.score < 0.8 ? 0.5 : concentration.score < 1.3 ? 0.2 : 0;
  const limitationPenalty = input.analysis.status === "observation_only"
    ? 0.4
    : input.analysis.status === "limited" ? 0.2 : 0;
  const score = roundOne(clamp(2.5 - unknownPenalty - structurePenalty - limitationPenalty, 0, 2.5));
  return {
    id: "fit",
    label: "约束匹配",
    score,
    maxScore: 2.5,
    summary: knownCount === values.length
      ? "期限、流动性、回撤与目标均可用于判断"
      : "个人约束未补齐，匹配度只能保守估计",
  };
}

const ROASTS: Record<ScoreDimensionId, string> = {
  information: "仓里不是没故事，是信息还没讲全。先把关键约束补齐，再谈段位起飞。",
  coverage: "阵容已经报上来了，行情证据还在门外排队。缺口补齐，锐评才不靠猜。",
  diversification: "这套阵容主角光环太重，配角存在感偏低。结构一抖，整仓都跟着晃。",
  fit: "仓位有自己的想法，但期限、流动性和回撤底线还没完全对上暗号。",
};

export function scorePortfolio(input: PortfolioScoreInput): PortfolioScore {
  const dimensions = [
    informationDimension(input.snapshot),
    coverageDimension(input),
    diversificationDimension(input.snapshot),
    fitDimension(input),
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
