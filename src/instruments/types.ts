import type { AssetClass } from "../contracts/index.js";

/**
 * Reference dictionary entry used only as a form-filling aid.
 * Entries are static public identity facts (code/name), never market
 * evidence, quotes, or coverage claims.
 */
export interface InstrumentEntry {
  /** Full symbol with venue suffix, e.g. "510300.SH" or "110022.OF". */
  symbol: string;
  name: string;
  /** Precomputed offline; runtime never derives pinyin. */
  pinyin_initials: string;
  asset_class: AssetClass;
  /** Market venue when applicable (SH/SZ); absent for off-exchange funds. */
  market?: string;
}

/** Suggestion returned to the client; a subset of the entry fields. */
export interface InstrumentSuggestion {
  symbol: string;
  name: string;
  asset_class: AssetClass;
  market?: string;
}
