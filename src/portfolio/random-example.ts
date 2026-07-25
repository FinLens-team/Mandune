/**
 * Random experience holdings for the data-management page.
 * Identities come from the built-in static instrument dictionary; scale stays
 * directional text only. Always labeled as experience data — never presented
 * as real private holdings, and never bypassing user confirmation.
 */

import type { DraftLine, PortfolioDraft } from "../contracts/index.js";
import { INSTRUMENT_DICTIONARY } from "../instruments/index.js";
import { addLine } from "./draft.js";
import { createId } from "./ids.js";
import { withUsability } from "./usability.js";

export const RANDOM_EXAMPLE_NAME_PREFIX = "体验示例 · ";
export const RANDOM_EXAMPLE_NOTE = "随机体验数据，非真实持仓";

/** Directional-only scale text; exact amounts/shares are a product red line. */
const RANDOM_SIZE_BASIS_VARIANTS = [
  "体验持仓规模：较小",
  "体验持仓规模：中等",
  "体验持仓规模：较大",
] as const;

const DEFAULT_RANDOM_COUNT = 3;

function pickIndex(random: () => number, length: number): number {
  return Math.min(Math.floor(random() * length), length - 1);
}

export function createRandomExampleLines(input?: {
  count?: number;
  random?: () => number;
}): DraftLine[] {
  const random = input?.random ?? Math.random;
  const count = Math.max(
    1,
    Math.min(input?.count ?? DEFAULT_RANDOM_COUNT, INSTRUMENT_DICTIONARY.length),
  );
  // 不重复抽取，避免同一标的出现多条随机行。
  const pool = [...INSTRUMENT_DICTIONARY];
  const lines: DraftLine[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = pool.splice(pickIndex(random, pool.length), 1)[0];
    if (!entry) break;
    const sizeBasis =
      RANDOM_SIZE_BASIS_VARIANTS[pickIndex(random, RANDOM_SIZE_BASIS_VARIANTS.length)]!;
    lines.push(
      withUsability({
        line_id: createId("line"),
        asset_class: entry.asset_class,
        name: `${RANDOM_EXAMPLE_NAME_PREFIX}${entry.name}`,
        symbol: entry.symbol,
        ...(entry.market ? { market: entry.market } : {}),
        size_basis: sizeBasis,
        // 随机数据没有真实观察时点，保持未知而不是伪造日期。
        observation_date: "unknown",
        entry_method: "example",
        notes: RANDOM_EXAMPLE_NOTE,
      }),
    );
  }
  return lines;
}

export function appendRandomExampleLines(
  draft: PortfolioDraft,
  input?: { count?: number; random?: () => number },
): PortfolioDraft {
  return createRandomExampleLines(input).reduce(
    (current, line) => addLine(current, line),
    draft,
  );
}
