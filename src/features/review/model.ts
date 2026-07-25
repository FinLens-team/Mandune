import type {
  DraftLine,
  PersonalConstraints,
  PortfolioDraft,
  PortfolioSnapshot,
} from "../../contracts/index.js";
import {
  addLine,
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

export function editHolding(
  draft: PortfolioDraft,
  lineId: string,
  patch: Partial<Pick<DraftLine, "asset_class" | "name" | "symbol" | "size_basis" | "observation_date">>,
): PortfolioDraft {
  return updateLine(draft, lineId, patch);
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
      observation_date: input.observation_date.trim() || "unknown",
    }),
  );
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
