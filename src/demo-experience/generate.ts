import type { PersonalConstraints } from "../contracts/index.js";
import {
  INSTRUMENT_DICTIONARY,
  type InstrumentEntry,
} from "../instruments/index.js";
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

function takeRandom<T>(items: T[], random: () => number): T {
  const index = Math.floor(random() * items.length);
  const [value] = items.splice(index, 1);
  if (value === undefined) {
    throw new Error("demo_experience_empty_candidate_pool");
  }
  return value;
}

function generatePortfolio(
  random: () => number,
  excludedSymbols: ReadonlySet<string>,
): Array<{ instrument: InstrumentEntry; sizeBasis: string }> {
  const available = INSTRUMENT_DICTIONARY.filter(
    (instrument) => !excludedSymbols.has(instrument.symbol),
  );
  const stocks = available.filter((instrument) => instrument.asset_class === "a_share");
  const etfs = available.filter((instrument) => instrument.asset_class === "etf");
  const funds = available.filter((instrument) => instrument.asset_class === "fund");
  if (stocks.length < 2 || etfs.length < 1 || funds.length < 1) {
    throw new Error("demo_experience_has_no_diversified_portfolio_candidates");
  }

  const selected = [
    takeRandom(stocks, random),
    takeRandom(stocks, random),
    takeRandom(etfs, random),
    takeRandom(funds, random),
  ];
  const selectedSymbols = new Set(selected.map((instrument) => instrument.symbol));
  const remaining = available.filter(
    (instrument) => !selectedSymbols.has(instrument.symbol),
  );
  const targetCount = 4 + Math.floor(random() * 3);
  while (selected.length < targetCount && remaining.length > 0) {
    selected.push(takeRandom(remaining, random));
  }

  for (let index = selected.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [selected[index], selected[swapIndex]] = [selected[swapIndex]!, selected[index]!];
  }

  return selected.map((instrument, index) => ({
    instrument,
    sizeBasis: index === 0
      ? "核心仓位，约占组合两成以上"
      : index <= 2
        ? "中等仓位，约占组合一到两成"
        : "小仓位，约占组合一成以内",
  }));
}

function generateConstraints(random: () => number): PersonalConstraints {
  return {
    investment_horizon: pick(CONSTRAINT_VARIANTS.investment_horizon, random),
    near_term_liquidity: pick(CONSTRAINT_VARIANTS.near_term_liquidity, random),
    tolerable_drawdown: pick(CONSTRAINT_VARIANTS.tolerable_drawdown, random),
    investment_objective: pick(CONSTRAINT_VARIANTS.investment_objective, random),
  };
}

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const holdings: DemoExperienceHolding[] = generatePortfolio(
    random,
    excludedSymbols ?? new Set(),
  ).map(({ instrument, sizeBasis }, index) => ({
    line_id: `line-${seedLabel}-${index + 1}`,
    asset_class: instrument.asset_class,
    name: instrument.name,
    symbol: instrument.symbol,
    ...(instrument.market ? { market: instrument.market } : {}),
    size_basis: sizeBasis,
    observation_date: localDate(createdAt),
    source_name: DEMO_EXPERIENCE_SOURCE_LABEL,
  }));
  return {
    identity_id: `identity-${seedLabel}`,
    seed: seedLabel,
    scenario_id: "random_portfolio",
    theme_id: "eastern_observation",
    created_at: createdAt.toISOString(),
    is_example: true,
    source_kind: "generated",
    source_label: DEMO_EXPERIENCE_SOURCE_LABEL,
    holdings,
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
