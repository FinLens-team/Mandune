import type {
  DraftLine,
  PersonalConstraints,
  PortfolioDraft,
  PortfolioSnapshot,
  UnknownFieldState,
} from "../../contracts/index.js";
import {
  addLine,
  appendRandomExampleLines,
  createManualLine,
  createSnapshotFromDraft,
  removeLine,
  updateConstraints,
  updateCashBalance,
  updateTotalMarketValue,
  updateLine,
} from "../../portfolio/index.js";
import type { ThemeId } from "../../theme/index.js";

export interface NewHoldingInput {
  asset_class: DraftLine["asset_class"];
  name: string;
  symbol: string;
  /** Optional venue filled by instrument suggestions; free text stays valid. */
  market?: string;
  size_basis: string;
  observation_date: string;
  current_market_value_cny?: string;
  cost_basis_cny?: string;
}

const UNKNOWN_STATES: ReadonlySet<string> = new Set(["unknown", "not_decided"]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isUnknownState(value: string): value is UnknownFieldState {
  return UNKNOWN_STATES.has(value);
}

/** Blank optional text becomes the typed unknown state instead of an empty string. */
function normalizeOptionalText(value: string | UnknownFieldState): string | UnknownFieldState {
  if (isUnknownState(value)) return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "unknown";
}

/** Blank valuation inputs stay absent; malformed or negative inputs never enter the draft. */
export function normalizeOptionalCnyAmount(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const amount = Number(trimmed);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

/**
 * Drafts only accept YYYY-MM-DD or a typed unknown state. Partial or malformed
 * input stays "unknown" in the draft so every keystroke-persisted draft remains
 * contract-valid; the UI keeps the raw text locally while the user types.
 */
export function normalizeObservationDate(
  value: string | UnknownFieldState,
): string | UnknownFieldState {
  if (isUnknownState(value)) return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return "unknown";
  return ISO_DATE_PATTERN.test(trimmed) ? trimmed : "unknown";
}

export function editHolding(
  draft: PortfolioDraft,
  lineId: string,
  patch: Partial<Pick<DraftLine, "asset_class" | "name" | "symbol" | "size_basis" | "observation_date" | "current_market_value_cny" | "cost_basis_cny">>,
): PortfolioDraft {
  // Normalize at the feature boundary: the draft is persisted (and contract
  // validated) on every change, so it must never carry empty strings or
  // malformed dates in symbol/size_basis/observation_date.
  const next: Partial<Pick<DraftLine, "asset_class" | "name" | "symbol" | "size_basis" | "observation_date" | "current_market_value_cny" | "cost_basis_cny">> = {};
  if (patch.asset_class !== undefined) next.asset_class = patch.asset_class;
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    // 空名称不写入草稿：契约要求 name 非空，保留原值等待用户补全。
    if (name.length > 0) next.name = name;
  }
  if (patch.symbol !== undefined) next.symbol = normalizeOptionalText(patch.symbol);
  if (patch.size_basis !== undefined) next.size_basis = normalizeOptionalText(patch.size_basis);
  if (patch.observation_date !== undefined) {
    next.observation_date = normalizeObservationDate(patch.observation_date);
  }
  if ("current_market_value_cny" in patch) {
    const amount = patch.current_market_value_cny;
    next.current_market_value_cny =
      typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? amount : undefined;
  }
  if ("cost_basis_cny" in patch) {
    const amount = patch.cost_basis_cny;
    next.cost_basis_cny =
      typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? amount : undefined;
  }
  if (Object.keys(next).length === 0) return draft;
  return updateLine(draft, lineId, next);
}

export function appendHolding(draft: PortfolioDraft, input: NewHoldingInput): PortfolioDraft {
  const market = input.market?.trim();
  return addLine(
    draft,
    createManualLine({
      asset_class: input.asset_class,
      name: input.name,
      symbol: input.symbol.trim() || "unknown",
      ...(market ? { market } : {}),
      size_basis: input.size_basis.trim() || "unknown",
      observation_date: normalizeObservationDate(input.observation_date),
      current_market_value_cny: normalizeOptionalCnyAmount(input.current_market_value_cny ?? ""),
      cost_basis_cny: normalizeOptionalCnyAmount(input.cost_basis_cny ?? ""),
    }),
  );
}

/** Append one contract-valid random holding that still requires confirmation. */
export function appendRandomHoldings(
  draft: PortfolioDraft,
  input?: { random?: () => number; now?: Date },
): PortfolioDraft {
  return appendRandomExampleLines(draft, input);
}

function formatPercent(value: number): string {
  return Number(value.toFixed(1)).toString();
}

function randomWeightLabel(value: number, total: number): string {
  const percent = value / total * 100;
  const descriptor = percent >= 25 ? "核心仓位" : percent >= 15 ? "中等仓位" : "小仓位";
  return `${descriptor}，约占当前持仓总市值 ${formatPercent(percent)}%`;
}

/** Append a server-valued example and keep portfolio-level amounts coherent. */
export function appendServerRandomHolding(
  draft: PortfolioDraft,
  line: DraftLine,
  cashBalanceCny: number,
): PortfolioDraft {
  if (draft.lines.some((existing) => existing.symbol === line.symbol)) return draft;
  let next = addLine(draft, line);
  const valuedLines = next.lines.filter(
    (item) => typeof item.current_market_value_cny === "number" && Number.isFinite(item.current_market_value_cny),
  );
  const total = draft.total_market_value_cny !== undefined
    ? draft.total_market_value_cny + (line.current_market_value_cny ?? 0)
    : valuedLines.length === next.lines.length
      ? valuedLines.reduce((sum, item) => sum + (item.current_market_value_cny ?? 0), 0)
      : undefined;
  if (total !== undefined && total > 0) {
    next = updateTotalMarketValue(next, total);
    for (const item of next.lines) {
      if (item.current_market_value_cny !== undefined) {
        next = updateLine(next, item.line_id, {
          size_basis: randomWeightLabel(item.current_market_value_cny, total),
        });
      }
    }
  }
  return updateCashBalance(next, draft.cash_balance_cny ?? cashBalanceCny);
}

export function deleteHolding(draft: PortfolioDraft, lineId: string): PortfolioDraft {
  return removeLine(draft, lineId);
}

export function editConstraints(
  draft: PortfolioDraft,
  constraints: PersonalConstraints,
): PortfolioDraft {
  return updateConstraints(draft, constraints);
}

export function editCashBalance(draft: PortfolioDraft, rawValue: string): PortfolioDraft {
  return updateCashBalance(draft, normalizeOptionalCnyAmount(rawValue));
}

export function editTotalMarketValue(draft: PortfolioDraft, rawValue: string): PortfolioDraft {
  return updateTotalMarketValue(draft, normalizeOptionalCnyAmount(rawValue));
}

export function snapshotCurrentDraft(draft: PortfolioDraft, themeId?: ThemeId):
  | { ok: true; snapshot: PortfolioSnapshot; skippedCount: number }
  | { ok: false; message: string } {
  const result = createSnapshotFromDraft(draft, themeId ? { theme_id: themeId } : undefined);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return {
    ok: true,
    snapshot: result.snapshot,
    skippedCount: result.skipped_line_ids.length,
  };
}
