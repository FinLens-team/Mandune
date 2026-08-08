import type {
  AssetClass,
  DraftLine,
  EntryMethod,
  PersonalConstraints,
  PortfolioDraft,
  UnknownFieldState,
} from "../contracts/index.js";
import { createId, nowIso } from "./ids.js";
import { withUsability } from "./usability.js";

export function createEmptyDraft(input?: {
  source_label?: string;
  entry_method?: EntryMethod;
}): PortfolioDraft {
  const timestamp = nowIso();
  return {
    draft_id: createId("draft"),
    created_at: timestamp,
    updated_at: timestamp,
    source_label: input?.source_label,
    constraints: emptyConstraints(),
    lines: [],
  };
}

export function emptyConstraints(): PersonalConstraints {
  return {
    investment_horizon: "unknown",
    near_term_liquidity: "unknown",
    tolerable_drawdown: "unknown",
    investment_objective: "unknown",
  };
}

export function createManualLine(input: {
  asset_class: AssetClass;
  name: string;
  symbol: string | UnknownFieldState;
  market?: string | UnknownFieldState;
  size_basis: string | UnknownFieldState;
  observation_date: string | UnknownFieldState;
  current_market_value_cny?: number;
  cost_basis_cny?: number;
}): DraftLine {
  return withUsability({
    line_id: createId("line"),
    asset_class: input.asset_class,
    name: input.name.trim() || "未命名持仓",
    symbol: normalizeOptional(input.symbol),
    market: input.market === undefined ? undefined : normalizeOptional(input.market),
    size_basis: normalizeOptional(input.size_basis),
    observation_date: normalizeOptional(input.observation_date),
    ...(input.current_market_value_cny !== undefined
      ? { current_market_value_cny: input.current_market_value_cny }
      : {}),
    ...(input.cost_basis_cny !== undefined ? { cost_basis_cny: input.cost_basis_cny } : {}),
    entry_method: "manual",
  });
}

function normalizeOptional(
  value: string | UnknownFieldState,
): string | UnknownFieldState {
  if (value === "unknown" || value === "not_decided") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "unknown";
}

export function addLine(draft: PortfolioDraft, line: DraftLine): PortfolioDraft {
  return {
    ...draft,
    updated_at: nowIso(),
    lines: [...draft.lines, withUsability(line)],
  };
}

export function updateLine(
  draft: PortfolioDraft,
  lineId: string,
  patch: Partial<Omit<DraftLine, "line_id" | "entry_method" | "is_usable" | "unresolved_fields">>,
): PortfolioDraft {
  return {
    ...draft,
    updated_at: nowIso(),
    lines: draft.lines.map((line) => {
      if (line.line_id !== lineId) return line;
      return withUsability({
        ...line,
        ...patch,
        line_id: line.line_id,
        entry_method: line.entry_method,
      });
    }),
  };
}

export function removeLine(draft: PortfolioDraft, lineId: string): PortfolioDraft {
  return {
    ...draft,
    updated_at: nowIso(),
    lines: draft.lines.filter((line) => line.line_id !== lineId),
  };
}

export function updateConstraints(
  draft: PortfolioDraft,
  constraints: PersonalConstraints,
): PortfolioDraft {
  return {
    ...draft,
    updated_at: nowIso(),
    constraints,
  };
}

export function updateCashBalance(
  draft: PortfolioDraft,
  cashBalanceCny: number | undefined,
): PortfolioDraft {
  const next: PortfolioDraft = { ...draft, updated_at: nowIso() };
  if (cashBalanceCny === undefined) {
    delete next.cash_balance_cny;
  } else {
    next.cash_balance_cny = cashBalanceCny;
  }
  return next;
}

export function updateTotalMarketValue(
  draft: PortfolioDraft,
  totalMarketValueCny: number | undefined,
): PortfolioDraft {
  const next: PortfolioDraft = { ...draft, updated_at: nowIso() };
  if (totalMarketValueCny === undefined) {
    delete next.total_market_value_cny;
  } else {
    next.total_market_value_cny = totalMarketValueCny;
  }
  return next;
}

export function listUsableLines(draft: PortfolioDraft): DraftLine[] {
  return draft.lines.filter((line) => line.is_usable);
}

export function listUnresolvedLines(draft: PortfolioDraft): DraftLine[] {
  return draft.lines.filter((line) => !line.is_usable);
}
