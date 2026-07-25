import { ASSET_CLASSES } from "../../contracts/index.js";
import type { InstrumentSuggestion } from "../../instruments/index.js";

export type InstrumentSearchFn = (
  query: string,
) => Promise<InstrumentSuggestion[]>;

const SUGGESTION_LIMIT = 8;

function isSuggestion(value: unknown): value is InstrumentSuggestion {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.symbol === "string" &&
    record.symbol.trim().length > 0 &&
    typeof record.name === "string" &&
    record.name.trim().length > 0 &&
    typeof record.asset_class === "string" &&
    (ASSET_CLASSES as readonly string[]).includes(record.asset_class) &&
    (record.market === undefined || typeof record.market === "string")
  );
}

/**
 * Assistive only: any network or validation failure degrades to
 * "no suggestions" and must never block free-text holding input.
 */
export const fetchInstrumentSuggestions: InstrumentSearchFn = async (query) => {
  try {
    const params = new URLSearchParams({ q: query });
    const response = await fetch(`/api/instruments/search?${params.toString()}`, {
      credentials: "same-origin",
    });
    if (!response.ok) return [];
    const body: unknown = await response.json();
    const suggestions =
      typeof body === "object" && body !== null
        ? (body as { suggestions?: unknown }).suggestions
        : undefined;
    return Array.isArray(suggestions)
      ? suggestions.filter(isSuggestion).slice(0, SUGGESTION_LIMIT)
      : [];
  } catch {
    return [];
  }
};
