import { createElement, type ComponentType, type RefObject } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createDemoExperienceFromSeed,
  DEMO_EXPERIENCE_SOURCE_LABEL,
} from "../../src/demo-experience/index.js";
import {
  createJourneyPersistence,
  experienceSourceFromDraft,
  identityToPortfolioDraft,
  initialJourneyState,
  journeyReducer,
} from "../../src/app/client/index.js";
import type { ThemeId } from "../../src/theme/index.js";


interface OnboardingScreensModule {
  SourceSelectionScreen: ComponentType<{
    onBack: () => void;
    onChooseManual: () => void;
    onChooseRandom: () => void;
    onChooseScreenshot: () => void;
    placeholderMessage: string | null;
    titleRef: RefObject<HTMLHeadingElement | null>;
  }>;
  ThemeSelectionScreen: ComponentType<{
    onContinue: () => void;
    onSelect: (themeId: ThemeId) => void;
    selectedThemeId: ThemeId;
    titleRef: RefObject<HTMLHeadingElement | null>;
  }>;
}

const ONBOARDING_PATH = [
  "..", "..", "src", "features", "onboarding", "index.js",
].join("/");

async function loadOnboardingScreens(): Promise<OnboardingScreensModule> {
  return (await import(ONBOARDING_PATH)) as OnboardingScreensModule;
}

describe("journey identity and pure state", () => {

  it("converts the confirmed random identity without replacing line, symbol, constraints, or labels", () => {
    const identity = createDemoExperienceFromSeed(
      42,
      () => new Date("2026-07-25T08:00:00.000Z"),
    );
    const draft = identityToPortfolioDraft(identity);

    expect(draft.draft_id).toBe(`draft-${identity.identity_id}`);
    expect(draft.source_label).toBe(`随机体验身份 · ${DEMO_EXPERIENCE_SOURCE_LABEL}`);
    expect(draft.constraints).toEqual(identity.constraints);
    expect(draft.constraints).not.toBe(identity.constraints);
    expect(draft.total_market_value_cny).toBe(identity.total_market_value_cny);
    expect(draft.cash_balance_cny).toBe(identity.cash_balance_cny);
    expect(draft.lines).toHaveLength(identity.holdings.length);
    for (const [index, line] of draft.lines.entries()) {
      const holding = identity.holdings[index]!;
      expect(line).toMatchObject({
        line_id: holding.line_id,
        symbol: holding.symbol,
        ...(holding.market ? { market: holding.market } : {}),
        size_basis: holding.size_basis,
        observation_date: holding.observation_date,
        current_market_value_cny: holding.current_market_value_cny,
        cost_basis_cny: holding.cost_basis_cny,
        entry_method: "example",
        is_usable: true,
      });
      expect(line.notes).toBe(`随机体验身份 · ${DEMO_EXPERIENCE_SOURCE_LABEL}`);
    }
  });

  it("keeps leave/resume and terminal displayability explicit", () => {
    let state = journeyReducer(initialJourneyState, {
      type: "BOOT_SUCCEEDED",
      workspace: {
        workspace_id: "workspace_state",
        last_active_at: "2026-07-25T08:00:00.000Z",
        expires_at: "2026-08-24T08:00:00.000Z",
        ttl_days: 30,
      },
      draft: null,
      experienceSource: "edited",
      currentThemeId: "jixing_doudou",
      reducedMotion: true,
      reviewCoachmarkVisible: false,
      resumeAnalysisId: "analysis_resume",
      resumeAnalysisSource: "random",
    });
    expect(state).toMatchObject({ phase: "onboarding", reducedMotion: true });

    const identity = createDemoExperienceFromSeed(7);
    state = journeyReducer(state, {
      type: "ENTER_APP",
      draft: identityToPortfolioDraft(identity),
      resumeAnalysisId: "analysis_resume",
      themeId: "jixing_doudou",
    });
    expect(state).toMatchObject({
      phase: "analysis",
      activeAnalysis: { analysisId: "analysis_resume", events: [] },
      experienceSource: "edited",
    });

    state = journeyReducer(state, { type: "ANALYSIS_LEFT" });
    expect(state.phase).toBe("home");
    expect(state.activeAnalysis?.analysisId).toBe("analysis_resume");
    state = journeyReducer(state, {
      type: "ANALYSIS_RESUMED",
      analysisId: "analysis_resume",
      experienceSource: "random",
      themeId: "jixing_doudou",
    });
    expect(state).toMatchObject({ phase: "analysis", activeAnalysis: { connection: "reconnecting" } });

    state = journeyReducer(state, {
      type: "ANALYSIS_TERMINAL",
      analysisId: "analysis_resume",
      terminal: {
        analysis_id: "analysis_resume",
        displayable: false,
        status: "supported",
        terminal_reason: "model_failure",
        reason: "叙事缺失",
      },
    });
    expect(state.activeAnalysis).toMatchObject({
      terminal: { displayable: false, terminal_reason: "model_failure" },
    });
    expect(state.activeAnalysis?.resultInput).toBeUndefined();
  });
});

describe("journey local preferences", () => {
  it("persists reduced motion and only a scoped analysis id, then clears all workspace markers", () => {
    const data = new Map<string, string>();
    const persistence = createJourneyPersistence({
      getItem: (key) => data.get(key) ?? null,
      removeItem: (key) => { data.delete(key); },
      setItem: (key, value) => { data.set(key, value); },
    });

    persistence.setReducedMotion("workspace_a", true);
    persistence.setActiveAnalysis("workspace_a", "analysis_safe");
    persistence.setExperienceSource("workspace_a", "edited");
    persistence.setAnalysisExperienceSource("workspace_a", "analysis_safe", "random");
    persistence.setReviewCoachmarkDismissed("workspace_a");
    persistence.setTheme("workspace_a", "sunge");
    persistence.setAnalysisTheme("workspace_a", "analysis_safe", "jixing_doudou");
    persistence.setActiveAnalysis("workspace_b", "analysis_other");
    expect(persistence.getReducedMotion("workspace_a")).toBe(true);
    expect(persistence.getActiveAnalysis("workspace_a")).toBe("analysis_safe");
    expect(persistence.getActiveAnalysis("workspace_b")).toBe("analysis_other");
    expect(persistence.getExperienceSource("workspace_a")).toBe("edited");
    expect(persistence.getAnalysisExperienceSource("workspace_a", "analysis_safe")).toBe("random");
    expect(persistence.getReviewCoachmarkDismissed("workspace_a")).toBe(true);
    expect(persistence.getTheme("workspace_a")).toBe("sunge");
    expect(persistence.getAnalysisTheme("workspace_a", "analysis_safe")).toBe("jixing_doudou");
    expect(JSON.stringify([...data.entries()])).not.toContain("510300.SH");

    persistence.clearWorkspace("workspace_a");
    expect(persistence.getReducedMotion("workspace_a")).toBeNull();
    expect(persistence.getActiveAnalysis("workspace_a")).toBeNull();
    expect(persistence.getExperienceSource("workspace_a")).toBeNull();
    expect(persistence.getAnalysisExperienceSource("workspace_a", "analysis_safe")).toBeNull();
    expect(persistence.getReviewCoachmarkDismissed("workspace_a")).toBe(false);
    expect(persistence.getTheme("workspace_a")).toBeNull();
    expect(persistence.getAnalysisTheme("workspace_a", "analysis_safe")).toBeNull();
    expect(persistence.getActiveAnalysis("workspace_b")).toBe("analysis_other");
  });

  it("derives only the current draft source from its durable source label", () => {
    const randomDraft = identityToPortfolioDraft(createDemoExperienceFromSeed(9));
    expect(experienceSourceFromDraft(randomDraft)).toBe("random");
    expect(experienceSourceFromDraft({
      ...randomDraft,
      source_label: "体验持仓 · 已编辑 · fixture 证据（非实时）",
    })).toBe("edited");
  });
});

describe("ordinary-entry theme selection", () => {
  it("offers seven themes with manual and local OCR initialization enabled", async () => {
    const { SourceSelectionScreen, ThemeSelectionScreen } = await loadOnboardingScreens();
    const theme = renderToStaticMarkup(createElement(ThemeSelectionScreen, {
      onContinue: vi.fn(),
      onSelect: vi.fn(),
      selectedThemeId: "eastern_observation",
      titleRef: { current: null },
    }));
    const source = renderToStaticMarkup(createElement(SourceSelectionScreen, {
      onBack: vi.fn(),
      onChooseManual: vi.fn(),
      onChooseRandom: vi.fn(),
      onChooseScreenshot: vi.fn(),
      placeholderMessage: null,
      titleRef: { current: null },
    }));

    expect(theme.match(/暂未开放/g)).toHaveLength(1);
    expect(theme).toContain("我是龙");
    expect(theme).toContain("吉星高照");
    expect(theme).toContain("孙哥");
    expect(theme).toContain("周礼");
    expect(theme).toContain("贴吧老哥");
    expect(theme).toContain("男魅魔");
    expect(theme).toContain("女魅魔");
    expect(source).toContain("手动填写持仓");
    expect(source).toContain("截图识别持仓");
    expect(source).not.toContain("即将开放");
    expect(source).toContain("可手动录入多项持仓，也可用本机 OCR 生成待确认草稿");
  });
});
