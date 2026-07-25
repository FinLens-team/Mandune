import { ASSET_CLASSES, type AssetClass } from "../contracts/index.js";
import { INSTRUMENT_DICTIONARY } from "./dictionary.js";
import type { InstrumentEntry, InstrumentSuggestion } from "./types.js";

export const INSTRUMENT_QUERY_MAX_LENGTH = 32;
export const INSTRUMENT_SUGGESTION_LIMIT = 8;

/** Only plain ASCII letters/digits may be treated as a pinyin-initials query. */
const PINYIN_QUERY = /^[a-z0-9]+$/;

function toHalfWidth(value: string): string {
  return value
    .replace(/[\uFF01-\uFF5E]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, " ");
}

function normalizeQuery(raw: string): string {
  return toHalfWidth(raw).replace(/\s+/g, "");
}

function bareCode(entry: InstrumentEntry): string {
  const dot = entry.symbol.indexOf(".");
  return dot > 0 ? entry.symbol.slice(0, dot) : entry.symbol;
}

/**
 * Deterministic match tiers (lower is better):
 * 0 exact code, 1 code prefix, 2 name prefix, 3 name substring,
 * 4 pinyin-initials prefix. Non-matches return null.
 */
function scoreEntry(
  entry: InstrumentEntry,
  upperQuery: string,
  lowerQuery: string,
): number | null {
  const code = bareCode(entry);
  if (entry.symbol === upperQuery || code === upperQuery) return 0;
  if (entry.symbol.startsWith(upperQuery) || code.startsWith(upperQuery)) return 1;
  const upperName = entry.name.toUpperCase();
  if (upperName.startsWith(upperQuery)) return 2;
  if (upperName.includes(upperQuery)) return 3;
  if (PINYIN_QUERY.test(lowerQuery) && entry.pinyin_initials.startsWith(lowerQuery)) {
    return 4;
  }
  return null;
}

export function isInstrumentAssetClass(value: string): value is AssetClass {
  return (ASSET_CLASSES as readonly string[]).includes(value);
}

/**
 * Pure fuzzy search over the static reference dictionary.
 * Assistive only: an empty result means "no dictionary match", never
 * "invalid holding" — callers must keep free text / unknown flows open.
 */
export function searchInstruments(
  rawQuery: string,
  options: { assetClass?: AssetClass; limit?: number } = {},
): InstrumentSuggestion[] {
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length === 0 || normalized.length > INSTRUMENT_QUERY_MAX_LENGTH) {
    return [];
  }
  const upperQuery = normalized.toUpperCase();
  const lowerQuery = normalized.toLowerCase();
  const limit = options.limit ?? INSTRUMENT_SUGGESTION_LIMIT;

  const scored: { score: number; entry: InstrumentEntry }[] = [];
  for (const entry of INSTRUMENT_DICTIONARY) {
    if (options.assetClass && entry.asset_class !== options.assetClass) continue;
    const score = scoreEntry(entry, upperQuery, lowerQuery);
    if (score !== null) scored.push({ score, entry });
  }
  scored.sort(
    (a, b) => a.score - b.score || a.entry.symbol.localeCompare(b.entry.symbol),
  );
  return scored.slice(0, Math.max(0, limit)).map(({ entry }) => ({
    symbol: entry.symbol,
    name: entry.name,
    asset_class: entry.asset_class,
    ...(entry.market ? { market: entry.market } : {}),
  }));
}
