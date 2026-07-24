import type { DraftLine, UnknownFieldState } from "../contracts/index.js";

const UNKNOWN_STATES = new Set<UnknownFieldState>(["unknown", "not_decided"]);

function isKnownString(value: string | UnknownFieldState | undefined): value is string {
  return typeof value === "string" && !UNKNOWN_STATES.has(value as UnknownFieldState) && value.trim().length > 0;
}

/**
 * A draft line is usable only when asset identity and size basis are confirmable.
 * Unusable lines may remain on the page as unresolved unknowns.
 */
export function computeUsability(line: Omit<DraftLine, "is_usable" | "unresolved_fields">): {
  is_usable: boolean;
  unresolved_fields: string[];
} {
  const unresolved: string[] = [];
  if (!isKnownString(line.name)) unresolved.push("name");
  if (!isKnownString(line.symbol)) unresolved.push("symbol");
  if (!isKnownString(line.size_basis)) unresolved.push("size_basis");
  if (line.observation_date !== undefined && !isKnownString(line.observation_date) && !UNKNOWN_STATES.has(line.observation_date as UnknownFieldState)) {
    unresolved.push("observation_date");
  }
  // observation_date may remain unknown; identity + size are required for usable
  return {
    is_usable: unresolved.length === 0,
    unresolved_fields: unresolved,
  };
}

export function withUsability(
  line: Omit<DraftLine, "is_usable" | "unresolved_fields">,
): DraftLine {
  const usability = computeUsability(line);
  return {
    ...line,
    is_usable: usability.is_usable,
    unresolved_fields: usability.unresolved_fields,
  };
}
