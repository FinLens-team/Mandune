import { THEMES } from "./catalog.js";

export const OBSERVATION_THEME = {
  ...THEMES.eastern_observation,
  narration: THEMES.eastern_observation.description,
} as const;

export const LOCKED_THEME_PREVIEWS = [] as const;
