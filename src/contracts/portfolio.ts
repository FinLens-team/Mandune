/**
 * Portfolio draft, confirmed lines, constraints, and immutable snapshots.
 */

import type {
  AssetClass,
  EntryMethod,
  IsoDateString,
  IsoDateTimeString,
  UnknownFieldState,
} from "./common.js";

/** A line still under review; may contain unresolved unknowns. */
export interface DraftLine {
  line_id: string;
  asset_class: AssetClass;
  /** User-facing name; may be provisional before confirmation. */
  name: string;
  /** Ticker/code when known; otherwise typed unknown. */
  symbol: string | UnknownFieldState;
  /** Market venue when applicable (e.g. SH/SZ); optional for funds. */
  market?: string | UnknownFieldState;
  /**
   * Holding-size basis as structured text or unknown.
   * Exact numeric trade instructions are forbidden later in advice; drafts may
   * retain user-confirmed scale facts for analysis input only.
   */
  size_basis: string | UnknownFieldState;
  observation_date: IsoDateString | UnknownFieldState;
  entry_method: EntryMethod;
  /** Whether the line currently qualifies as usable (not yet confirmed). */
  is_usable: boolean;
  unresolved_fields: string[];
  notes?: string;
  /** Optional user-entered holding market value in CNY; omitted when unavailable. */
  current_market_value_cny?: number;
  /** Optional user-entered holding cost basis in CNY; omitted when unavailable. */
  cost_basis_cny?: number;
}

/** User-accepted line that may enter a snapshot. */
export interface ConfirmedLine {
  line_id: string;
  asset_class: AssetClass;
  name: string;
  symbol: string;
  market?: string;
  size_basis: string;
  observation_date: IsoDateString | UnknownFieldState;
  entry_method: EntryMethod;
  confirmed_at: IsoDateTimeString;
  /** Optional user-entered holding market value in CNY at confirmation time. */
  current_market_value_cny?: number;
  /** Optional user-entered holding cost basis in CNY at confirmation time. */
  cost_basis_cny?: number;
}

/**
 * Four minimum personal constraints.
 * Each field may be a free-text choice or an explicit unknown/not_decided.
 */
export interface PersonalConstraints {
  investment_horizon: string | UnknownFieldState;
  near_term_liquidity: string | UnknownFieldState;
  tolerable_drawdown: string | UnknownFieldState;
  investment_objective: string | UnknownFieldState;
}

export interface PortfolioDraft {
  draft_id: string;
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
  source_label?: string;
  /** Optional user-entered total market value of all holdings in CNY, excluding cash. */
  total_market_value_cny?: number;
  /** Optional user-entered cash balance in CNY; omitted when unavailable. */
  cash_balance_cny?: number;
  lines: DraftLine[];
  constraints: PersonalConstraints;
}

/**
 * Immutable portfolio snapshot: confirmed lines + constraints at one moment.
 * Later edits produce a new snapshot_id; old ones are never rewritten.
 */
export interface PortfolioSnapshot {
  snapshot_id: string;
  created_at: IsoDateTimeString;
  contracts_version: string;
  theme_id: string;
  /** Optional user-entered total market value of all holdings in CNY, excluding cash. */
  total_market_value_cny?: number;
  /** Optional user-entered cash balance in CNY captured with this snapshot. */
  cash_balance_cny?: number;
  lines: ConfirmedLine[];
  constraints: PersonalConstraints;
}
