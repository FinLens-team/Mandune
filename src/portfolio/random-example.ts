/** Random holding data for the data-management page. */

import type { DraftLine, PortfolioDraft } from "../contracts/index.js";
import { INSTRUMENT_DICTIONARY } from "../instruments/index.js";
import { addLine, updateCashBalance, updateLine, updateTotalMarketValue } from "./draft.js";
import { createId } from "./ids.js";
import { withUsability } from "./usability.js";

/** Generated examples carry non-live amounts; the editor normalizes their weight text against the combined total. */
const RANDOM_SIZE_BASIS_VARIANTS = [
  "小仓位，约占组合一成以内",
  "中等仓位，约占组合一到两成",
  "核心仓位，约占组合两成以上",
] as const;

const MIN_OBSERVATION_AGE_DAYS = 7;
const OBSERVATION_AGE_RANGE_DAYS = 84;

function pickIndex(random: () => number, length: number): number {
  return Math.min(Math.floor(random() * length), length - 1);
}

function randomObservationDate(random: () => number, now: Date): string {
  const ageDays = MIN_OBSERVATION_AGE_DAYS + Math.floor(random() * OBSERVATION_AGE_RANGE_DAYS);
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ageDays);

  // Move weekend dates to the preceding trading day without pretending to
  // account for exchange holidays.
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() - 2);
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function createRandomExampleLines(input?: {
  random?: () => number;
  now?: Date;
  excludedSymbols?: ReadonlySet<string>;
  createLineId?: () => string;
}): DraftLine[] {
  const random = input?.random ?? Math.random;
  const pool = INSTRUMENT_DICTIONARY.filter(
    (entry) => !input?.excludedSymbols?.has(entry.symbol),
  );
  const entry = pool[pickIndex(random, pool.length)];
  if (!entry) return [];

  const sizeBasis =
    RANDOM_SIZE_BASIS_VARIANTS[pickIndex(random, RANDOM_SIZE_BASIS_VARIANTS.length)]!;
  const currentMarketValue = Math.round((5_000 + random() * 45_000) / 100) * 100;
  const costBasis = Math.round(currentMarketValue * (0.88 + random() * 0.24) * 100) / 100;
  return [
    withUsability({
      line_id: input?.createLineId?.() ?? createId("line"),
      asset_class: entry.asset_class,
      name: entry.name,
      symbol: entry.symbol,
      ...(entry.market ? { market: entry.market } : {}),
      size_basis: sizeBasis,
      observation_date: randomObservationDate(random, input?.now ?? new Date()),
      current_market_value_cny: currentMarketValue,
      cost_basis_cny: costBasis,
      entry_method: "manual",
    }),
  ];
}

function randomWeightLabel(value: number, total: number): string {
  const percent = value / total * 100;
  const descriptor = percent >= 25 ? "核心仓位" : percent >= 15 ? "中等仓位" : "小仓位";
  return `${descriptor}，约占当前持仓总市值 ${Number(percent.toFixed(1))}%`;
}

export function appendRandomExampleLines(
  draft: PortfolioDraft,
  input?: { random?: () => number; now?: Date },
): PortfolioDraft {
  const random = input?.random ?? Math.random;
  const excludedSymbols = new Set(
    draft.lines
      .map((line) => line.symbol)
      .filter((symbol): symbol is string => symbol !== "unknown" && symbol !== "not_decided"),
  );
  const generated = createRandomExampleLines({ ...input, random, excludedSymbols });
  let next = generated.reduce((current, line) => addLine(current, line), draft);
  const valuedLines = next.lines.filter((line) => line.current_market_value_cny !== undefined);
  const addedValue = generated.reduce((sum, line) => sum + (line.current_market_value_cny ?? 0), 0);
  const total = draft.total_market_value_cny !== undefined
    ? draft.total_market_value_cny + addedValue
    : valuedLines.length === next.lines.length
      ? valuedLines.reduce((sum, line) => sum + (line.current_market_value_cny ?? 0), 0)
      : undefined;
  if (total !== undefined && total > 0) {
    next = updateTotalMarketValue(next, total);
    for (const line of next.lines) {
      if (line.current_market_value_cny !== undefined) {
        next = updateLine(next, line.line_id, {
          size_basis: randomWeightLabel(line.current_market_value_cny, total),
        });
      }
    }
  }
  if (draft.cash_balance_cny === undefined && addedValue > 0) {
    const cashRatio = 0.1 + random() * 0.12;
    next = updateCashBalance(next, Math.round(addedValue * cashRatio / (1 - cashRatio) * 100) / 100);
  }
  return next;
}
