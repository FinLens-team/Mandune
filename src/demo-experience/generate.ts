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

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function weekdayDate(date: Date): string {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  while (result.getDay() === 0 || result.getDay() === 6) result.setDate(result.getDate() - 1);
  return localDate(result);
}

function historicalDate(random: () => number, createdAt: Date): string {
  const result = new Date(createdAt);
  result.setDate(result.getDate() - (10 + Math.floor(random() * 80)));
  return weekdayDate(result);
}

function generatePortfolio(
  random: () => number,
  excludedSymbols: ReadonlySet<string>,
): Array<{ instrument: InstrumentEntry; weightPercent: number }> {
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

  const weightsByCount: Record<number, readonly number[]> = {
    4: [30, 26, 24, 20],
    5: [28, 22, 19, 16, 15],
    6: [25, 20, 17, 15, 13, 10],
  };
  const weights = weightsByCount[selected.length] ?? weightsByCount[4]!;
  return selected.map((instrument, index) => ({
    instrument,
    weightPercent: weights[index] ?? 0,
  }));
}

function generateConstraints(
  random: () => number,
  equityWeightPercent: number,
  cashRatio: number,
): PersonalConstraints {
  return {
    investment_horizon: equityWeightPercent >= 60 ? pick(["3-5年", "5年以上"], random) : "3-5年",
    near_term_liquidity: cashRatio >= 0.18 ? pick(["一般", "较高"], random) : "很低",
    tolerable_drawdown: equityWeightPercent >= 70 ? "较高" : equityWeightPercent >= 45 ? "中等" : "较低",
    investment_objective: equityWeightPercent >= 60 ? "长期增长" : "稳健增长",
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
  const generatedPortfolio = generatePortfolio(
    random,
    excludedSymbols ?? new Set(),
  );
  const totalMarketValue = Math.round((50_000 + random() * 180_000) / 100) * 100;
  const cashRatio = 0.1 + random() * 0.12;
  const cashBalance = money(totalMarketValue * cashRatio / (1 - cashRatio));
  const equityWeightPercent = generatedPortfolio
    .filter(({ instrument }) => instrument.asset_class === "a_share" || instrument.asset_class === "etf")
    .reduce((sum, { weightPercent }) => sum + weightPercent, 0);
  let allocated = 0;
  const holdings: DemoExperienceHolding[] = generatedPortfolio.map(({ instrument, weightPercent }, index) => {
    const currentValue = index === generatedPortfolio.length - 1
      ? money(totalMarketValue - allocated)
      : money(totalMarketValue * weightPercent / 100);
    allocated += currentValue;
    const costMultiplier = 0.88 + random() * 0.24;
    const descriptor = index === 0 ? "核心仓位" : index <= 2 ? "中等仓位" : "小仓位";
    return {
      line_id: `line-${seedLabel}-${index + 1}`,
      asset_class: instrument.asset_class,
      name: instrument.name,
      symbol: instrument.symbol,
      ...(instrument.market ? { market: instrument.market } : {}),
      size_basis: `${descriptor}，约占当前持仓总市值 ${weightPercent}%`,
      observation_date: historicalDate(random, createdAt),
      current_market_value_cny: currentValue,
      cost_basis_cny: money(currentValue * costMultiplier),
      source_name: DEMO_EXPERIENCE_SOURCE_LABEL,
    };
  });
  return {
    identity_id: `identity-${seedLabel}`,
    seed: seedLabel,
    scenario_id: "random_portfolio",
    theme_id: "eastern_observation",
    created_at: createdAt.toISOString(),
    is_example: true,
    source_kind: "generated",
    source_label: DEMO_EXPERIENCE_SOURCE_LABEL,
    total_market_value_cny: totalMarketValue,
    cash_balance_cny: cashBalance,
    holdings,
    constraints: generateConstraints(random, equityWeightPercent, cashRatio),
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
