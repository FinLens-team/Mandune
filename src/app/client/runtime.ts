import {
  validatePortfolioSnapshot,
  type AnalysisResult,
  type PortfolioSnapshot,
} from "../../contracts/index.js";
import {
  THEME_NARRATIVE_SCHEMA_VERSION,
  validateOwnedAnalysisResult,
  validateThemeModelOutput,
  type ThemeModelOutput,
} from "../../analysis/index.js";
import type { JourneyExperienceSource } from "./source.js";

export interface JourneyLongCardRuntimeInput {
  analysis: AnalysisResult;
  exampleLabel?: string;
  experienceSource?: JourneyExperienceSource;
  isExample: boolean;
  narrative?: ThemeModelOutput;
  aiText?: string;
  aiThemeText?: string;
  snapshot: PortfolioSnapshot;
}

export function journeyLongCardIsDisplayable(input: JourneyLongCardRuntimeInput): boolean {
  const { analysis, narrative, aiText, snapshot } = input;
  if (
    !validatePortfolioSnapshot(snapshot).ok ||
    !validateOwnedAnalysisResult(analysis).ok ||
    analysis.status === "unavailable" ||
    analysis.snapshot_id !== snapshot.snapshot_id ||
    analysis.contracts_version !== snapshot.contracts_version ||
    analysis.theme_id !== snapshot.theme_id ||
    JSON.stringify(analysis.constraints) !== JSON.stringify(snapshot.constraints)
  ) {
    return false;
  }
  // Relaxed Demo mode: a free-text model narrative is a valid front on its own,
  // rendered over the same deterministic analysis shell and rational back.
  if (aiText && aiText.trim()) return true;
  if (!narrative) return false;
  const rational = {
    schema_version: "rational-analysis.v1" as const,
    conclusions: analysis.conclusions,
    advice: analysis.advice,
    assumptions: analysis.assumptions,
    limitations: analysis.limitations,
    risk_notes: analysis.risk_notes,
  };
  if (!validateThemeModelOutput(narrative, rational, {
    analysisId: analysis.analysis_id,
    themeId: analysis.theme_id,
  })) {
    return false;
  }
  return narrative.schema_version === THEME_NARRATIVE_SCHEMA_VERSION &&
    narrative.rational_analysis_id === analysis.analysis_id &&
    narrative.theme_id === analysis.theme_id &&
    JSON.stringify(narrative.conclusion_ids) ===
      JSON.stringify(analysis.conclusions.map((item) => item.id)) &&
    JSON.stringify(narrative.advice_ids) ===
      JSON.stringify(analysis.advice.map((item) => item.id)) &&
    narrative.guidance_summary === analysis.advice.map((item) => item.statement).join("；");
}
