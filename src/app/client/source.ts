import type { PortfolioDraft } from "../../contracts/index.js";
import type { HistoryRecordV1 } from "../../history/index.js";

export type JourneyExperienceSource = "random" | "edited";

export const RANDOM_EXPERIENCE_LABEL = "随机体验身份";
export const EDITED_EXPERIENCE_LABEL = "体验持仓 · 已编辑";

export function experienceSourceFromDraft(
  draft: PortfolioDraft | null,
): JourneyExperienceSource {
  return draft?.source_label?.startsWith(EDITED_EXPERIENCE_LABEL) ? "edited" : "random";
}

export function markDraftExperienceSource(
  draft: PortfolioDraft,
  source: JourneyExperienceSource,
): PortfolioDraft {
  if (source === "random" || draft.source_label?.startsWith(EDITED_EXPERIENCE_LABEL)) {
    return draft;
  }
  const suffix = draft.source_label?.startsWith(RANDOM_EXPERIENCE_LABEL)
    ? draft.source_label.slice(RANDOM_EXPERIENCE_LABEL.length)
    : draft.source_label ? ` · ${draft.source_label}` : "";
  return { ...draft, source_label: `${EDITED_EXPERIENCE_LABEL}${suffix}` };
}

export function experienceSourceFromHistoryRecord(
  record: HistoryRecordV1,
): JourneyExperienceSource {
  return record.snapshot.lines.some((line) => line.entry_method !== "example")
    ? "edited"
    : "random";
}
