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
  updateLine,
} from "../../portfolio/index.js";

export interface NewHoldingInput {
  asset_class: DraftLine["asset_class"];
  name: string;
  symbol: string;
  /** Optional venue filled by instrument suggestions; free text stays valid. */
  market?: string;
  size_basis: string;
  observation_date: string;
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
  patch: Partial<Pick<DraftLine, "asset_class" | "name" | "symbol" | "size_basis" | "observation_date">>,
): PortfolioDraft {
  // Normalize at the feature boundary: the draft is persisted (and contract
  // validated) on every change, so it must never carry empty strings or
  // malformed dates in symbol/size_basis/observation_date.
  const next: Partial<Pick<DraftLine, "asset_class" | "name" | "symbol" | "size_basis" | "observation_date">> = {};
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
    }),
  );
}

/**
 * One-click experience data: append contract-valid random example holdings.
 * They stay drafts and still require explicit user confirmation to snapshot.
 */
export function appendRandomHoldings(
  draft: PortfolioDraft,
  input?: { count?: number; random?: () => number },
): PortfolioDraft {
  return appendRandomExampleLines(draft, input);
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

export function snapshotCurrentDraft(draft: PortfolioDraft):
  | { ok: true; snapshot: PortfolioSnapshot; skippedCount: number }
  | { ok: false; message: string } {
  const result = createSnapshotFromDraft(draft);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return {
    ok: true,
    snapshot: result.snapshot,
    skippedCount: result.skipped_line_ids.length,
  };
}
