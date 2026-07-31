import type { CSSProperties } from "react";
import doudouRest from "../client/assets/mascot/doudou/rest.webp";
import nailongLaugh from "../client/assets/mascot/nailong-laugh.webp";
import nailongPop from "../client/assets/mascot/nailong-pop.webp";
import nailongRest from "../client/assets/mascot/nailong-rest.webp";
import sungeIntro from "../client/assets/mascot/sunge/intro.mp4";
import sungeRest from "../client/assets/mascot/sunge/rest.webp";
import nailongThemeCard from "../client/assets/themes/theme-card-2.webp";
import doudouThemeCard from "../client/assets/themes/theme-card-3.webp";
import sungeThemeCard from "../client/assets/themes/theme-card-4.webp";
import femaleSuccubusThemeCard from "../client/assets/themes/theme-card-female-succubus.webp";
import maleSuccubusThemeCard from "../client/assets/themes/theme-card-male-succubus.webp";
import tiebaThemeCard from "../client/assets/themes/theme-card-tieba.webp";
import zhouliThemeCard from "../client/assets/themes/theme-card-zhouli.webp";
import { themeForId, type ThemeId } from "./catalog.js";

export interface ThemeClientAssets {
  home: { src: string; width: number; height: number };
  selection: { src: string; width: number; height: number };
  rest: { src: string; width: number; height: number };
  progressAnimation?:
    | { kind: "image"; src: string; durationMs: number }
    | { kind: "video"; src: string };
}

export const THEME_CLIENT_ASSETS: Readonly<Record<ThemeId, ThemeClientAssets>> = {
  eastern_observation: {
    home: { src: nailongLaugh, width: 658, height: 838 },
    selection: { src: nailongThemeCard, width: 366, height: 622 },
    rest: { src: nailongRest, width: 512, height: 512 },
    progressAnimation: { kind: "image", src: nailongPop, durationMs: 3650 },
  },
  jixing_doudou: {
    home: { src: doudouRest, width: 512, height: 512 },
    selection: { src: doudouThemeCard, width: 364, height: 622 },
    rest: { src: doudouRest, width: 512, height: 512 },
  },
  sunge: {
    home: { src: sungeRest, width: 512, height: 512 },
    selection: { src: sungeThemeCard, width: 730, height: 1244 },
    rest: { src: sungeRest, width: 512, height: 512 },
    progressAnimation: { kind: "video", src: sungeIntro },
  },
  zhouli: {
    home: { src: zhouliThemeCard, width: 732, height: 1244 },
    selection: { src: zhouliThemeCard, width: 732, height: 1244 },
    rest: { src: zhouliThemeCard, width: 732, height: 1244 },
  },
  tieba_laoge: {
    home: { src: tiebaThemeCard, width: 732, height: 1244 },
    selection: { src: tiebaThemeCard, width: 732, height: 1244 },
    rest: { src: tiebaThemeCard, width: 732, height: 1244 },
  },
  male_succubus: {
    home: { src: maleSuccubusThemeCard, width: 732, height: 1244 },
    selection: { src: maleSuccubusThemeCard, width: 732, height: 1244 },
    rest: { src: maleSuccubusThemeCard, width: 732, height: 1244 },
  },
  female_succubus: {
    home: { src: femaleSuccubusThemeCard, width: 732, height: 1244 },
    selection: { src: femaleSuccubusThemeCard, width: 732, height: 1244 },
    rest: { src: femaleSuccubusThemeCard, width: 732, height: 1244 },
  },
};

export function themeClientAssets(themeId: string): ThemeClientAssets {
  return THEME_CLIENT_ASSETS[themeForId(themeId).id];
}

export function themeCssVariables(themeId: string): CSSProperties {
  const { tokens } = themeForId(themeId);
  return {
    "--poster-bg": tokens.background,
    "--poster-bg-deep": tokens.backgroundDeep,
    "--poster-surface": tokens.surface,
    "--poster-ink": tokens.ink,
    "--poster-ink-soft": tokens.inkSoft,
    "--poster-gold": tokens.accent,
    "--poster-pill-bg": tokens.ink,
    "--poster-pill-ink": tokens.onAccent,
    "--poster-focus": tokens.focus,
    "--poster-line": tokens.border,
    "--theme-accent": tokens.accent,
    "--theme-bg": tokens.background,
    "--theme-bg-deep": tokens.backgroundDeep,
    "--theme-border": tokens.border,
    "--theme-focus": tokens.focus,
    "--theme-ink": tokens.ink,
    "--theme-ink-soft": tokens.inkSoft,
    "--theme-on-accent": tokens.onAccent,
    "--theme-surface": tokens.surface,
    "--theme-surface-raised": tokens.surfaceRaised,
  } as CSSProperties;
}
