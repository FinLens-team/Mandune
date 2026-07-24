import {
  CONTRACTS_VERSION,
  type ConfirmedLine,
  type DraftLine,
  type PortfolioDraft,
  type PortfolioSnapshot,
  type UnknownFieldState,
  validatePortfolioSnapshot,
} from "../contracts/index.js";
import { createId, nowIso } from "./ids.js";

export type SnapshotResult =
  | { ok: true; snapshot: PortfolioSnapshot; skipped_line_ids: string[] }
  | {
      ok: false;
      code: "no_usable_lines" | "validation_failed" | "ambiguous_lines_blocked";
      message: string;
      skipped_line_ids: string[];
    };

const UNKNOWN: ReadonlySet<string> = new Set(["unknown", "not_decided"]);

function isKnown(value: string | UnknownFieldState): value is string {
  return !UNKNOWN.has(value) && value.trim().length > 0;
}

export function draftLineToConfirmed(
  line: DraftLine,
  confirmedAt: string,
): ConfirmedLine | null {
  if (!line.is_usable) return null;
  if (!isKnown(line.symbol) || !isKnown(line.size_basis) || !isKnown(line.name)) {
    return null;
  }
  return {
    line_id: line.line_id,
    asset_class: line.asset_class,
    name: line.name,
    symbol: line.symbol,
    market:
      line.market !== undefined && isKnown(line.market) ? line.market : undefined,
    size_basis: line.size_basis,
    observation_date: line.observation_date,
    entry_method: line.entry_method,
    confirmed_at: confirmedAt,
  };
}

/**
 * Confirm only usable lines into an immutable snapshot.
 * Ambiguous/unsupported lines stay out of the snapshot and are reported as skipped.
 * Batch confirmation never writes unresolved lines.
 */
export function createSnapshotFromDraft(
  draft: PortfolioDraft,
  input: {
    theme_id?: string;
    line_ids?: string[];
  } = {},
): SnapshotResult {
  const confirmedAt = nowIso();
  const selectedIds = input.line_ids
    ? new Set(input.line_ids)
    : new Set(draft.lines.map((line) => line.line_id));

  const skipped: string[] = [];
  const confirmed: ConfirmedLine[] = [];

  for (const line of draft.lines) {
    if (!selectedIds.has(line.line_id)) {
      continue;
    }
    if (!line.is_usable) {
      skipped.push(line.line_id);
      continue;
    }
    const next = draftLineToConfirmed(line, confirmedAt);
    if (!next) {
      skipped.push(line.line_id);
      continue;
    }
    confirmed.push(next);
  }

  if (confirmed.length === 0) {
    return {
      ok: false,
      code: "no_usable_lines",
      message: "没有可确认的持仓行；未决未知项不会写入快照。",
      skipped_line_ids: skipped,
    };
  }

  const snapshot: PortfolioSnapshot = {
    snapshot_id: createId("snap"),
    created_at: confirmedAt,
    contracts_version: CONTRACTS_VERSION,
    theme_id: input.theme_id ?? "eastern_observation",
    lines: confirmed,
    constraints: draft.constraints,
  };

  const validated = validatePortfolioSnapshot(snapshot);
  if (!validated.ok) {
    return {
      ok: false,
      code: "validation_failed",
      message: validated.issues.map((issue) => issue.message).join("; "),
      skipped_line_ids: skipped,
    };
  }

  // Return a frozen copy so callers cannot mutate the snapshot in place.
  return {
    ok: true,
    snapshot: Object.freeze({
      ...validated.value,
      lines: Object.freeze([...validated.value.lines]) as ConfirmedLine[],
      constraints: Object.freeze({ ...validated.value.constraints }),
    }) as PortfolioSnapshot,
    skipped_line_ids: skipped,
  };
}
