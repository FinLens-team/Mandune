import type { PersonalConstraints } from "../contracts/index.js";
import { createRandomExampleLines } from "../portfolio/index.js";
import {
  DEMO_EXPERIENCE_SOURCE_LABEL,
  type DemoExperienceHolding,
  type DemoExperienceIdentity,
} from "./types.js";

const CONSTRAINT_VARIANTS: Readonly<
  Record<keyof PersonalConstraints, readonly string[]>
> = {
  investment_horizon: ["1-3年", "3-5年", "unknown"],
  near_term_liquidity: ["近期可能需要", "暂无明确近期需求", "not_decided"],
  tolerable_drawdown: ["较低", "中等", "unknown"],
  investment_objective: ["稳健增长", "长期增长", "not_decided"],
};

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  const index = Math.floor(random() * items.length);
  const value = items[index];
  if (value === undefined) {
    throw new Error("demo_experience_empty_candidate_pool");
  }
  return value;
}

function generateConstraints(random: () => number): PersonalConstraints {
  return {
    investment_horizon: pick(CONSTRAINT_VARIANTS.investment_horizon, random),
    near_term_liquidity: pick(CONSTRAINT_VARIANTS.near_term_liquidity, random),
    tolerable_drawdown: pick(CONSTRAINT_VARIANTS.tolerable_drawdown, random),
    investment_objective: pick(CONSTRAINT_VARIANTS.investment_objective, random),
  };
}

export function createDemoExperienceFromSeed(
  seed: number,
  now: () => Date = () => new Date(),
  excludedSymbols?: ReadonlySet<string>,
): DemoExperienceIdentity {
  const normalizedSeed = seed >>> 0;
  const random = mulberry32(normalizedSeed);
  const seedLabel = `demo-experience-${normalizedSeed.toString(16).padStart(8, "0")}`;
  const createdAt = now();
  const [line] = createRandomExampleLines({
    createLineId: () => `line-${seedLabel}`,
    excludedSymbols,
    now: createdAt,
    random,
  });
  if (!line) {
    throw new Error("demo_experience_has_no_random_holding_candidate");
  }
  const holding: DemoExperienceHolding = {
    line_id: line.line_id,
    asset_class: line.asset_class,
    name: line.name,
    symbol: String(line.symbol),
    ...(line.market ? { market: String(line.market) } : {}),
    size_basis: String(line.size_basis),
    observation_date: String(line.observation_date),
    source_name: DEMO_EXPERIENCE_SOURCE_LABEL,
  };
  return {
    identity_id: `identity-${seedLabel}`,
    seed: seedLabel,
    scenario_id: "random_portfolio",
    theme_id: "eastern_observation",
    created_at: createdAt.toISOString(),
    is_example: true,
    source_kind: "generated",
    source_label: DEMO_EXPERIENCE_SOURCE_LABEL,
    holdings: [holding],
    constraints: generateConstraints(random),
  };
}

export function createRandomDemoExperience(
  random: () => number = Math.random,
  now: () => Date = () => new Date(),
): DemoExperienceIdentity {
  const seed = Math.floor(random() * 4_294_967_296) >>> 0;
  return createDemoExperienceFromSeed(seed, now);
}

export function rerollDemoExperience(
  current: DemoExperienceIdentity,
  random: () => number = Math.random,
  now: () => Date = () => new Date(),
): DemoExperienceIdentity {
  const next = createRandomDemoExperience(random, now);
  const currentSymbols = new Set(current.holdings.map((holding) => holding.symbol));
  if (
    next.seed !== current.seed &&
    next.holdings.every((holding) => !currentSymbols.has(holding.symbol))
  ) {
    return next;
  }
  const currentSeed = Number.parseInt(current.seed.slice(-8), 16) >>> 0;
  return createDemoExperienceFromSeed((currentSeed + 1) >>> 0, now, currentSymbols);
}
