/** Random holding data for the data-management page. */

import type { DraftLine, PortfolioDraft } from "../contracts/index.js";
import { INSTRUMENT_DICTIONARY } from "../instruments/index.js";
import { addLine } from "./draft.js";
import { createId } from "./ids.js";
import { withUsability } from "./usability.js";

/** Directional-only scale text; exact amounts/shares are a product red line. */
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
  return [
    withUsability({
      line_id: input?.createLineId?.() ?? createId("line"),
      asset_class: entry.asset_class,
      name: entry.name,
      symbol: entry.symbol,
      ...(entry.market ? { market: entry.market } : {}),
      size_basis: sizeBasis,
      observation_date: randomObservationDate(random, input?.now ?? new Date()),
      entry_method: "manual",
    }),
  ];
}

export function appendRandomExampleLines(
  draft: PortfolioDraft,
  input?: { random?: () => number; now?: Date },
): PortfolioDraft {
  const excludedSymbols = new Set(
    draft.lines
      .map((line) => line.symbol)
      .filter((symbol): symbol is string => symbol !== "unknown" && symbol !== "not_decided"),
  );
  return createRandomExampleLines({ ...input, excludedSymbols }).reduce(
    (current, line) => addLine(current, line),
    draft,
  );
}
