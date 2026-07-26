import { readFileSync } from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDemoExperienceFromSeed } from "../../src/demo-experience/index.js";
import {
  markOnboardingCompleted,
  type OnboardingStorage,
} from "../../src/features/onboarding/storage.js";
import type { DemoExperienceIdentity } from "../../src/demo-experience/index.js";
import type { ThemeId } from "../../src/theme/index.js";

interface OnboardingModule {
  ThemeSelectionScreen: ComponentType<{
    selectedThemeId: ThemeId;
    onSelect: (themeId: ThemeId) => void;
    onContinue: () => void;
  }>;
  SourceSelectionScreen: ComponentType<{
    placeholderMessage: string | null;
    onBack: () => void;
    onChooseRandom: () => void;
    onPlaceholder: (source: "manual" | "screenshot") => void;
  }>;
  ExperienceSummaryScreen: ComponentType<{
    identity: DemoExperienceIdentity;
    onBack: () => void;
    onConfirm: () => void;
    onReroll: () => void;
  }>;
  OnboardingFlow: ComponentType<{
    workspaceId: string;
    onEnterApp: () => void;
    storage?: OnboardingStorage | null;
  }>;
}

const ONBOARDING_MODULE_PATH = [
  "..",
  "..",
  "src",
  "features",
  "onboarding",
  "index.js",
].join("/");

async function loadOnboarding(): Promise<OnboardingModule> {
  return (await import(ONBOARDING_MODULE_PATH)) as OnboardingModule;
}

const noop = () => undefined;

class MemoryStorage implements OnboardingStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("S0-S3 onboarding screens", () => {
  it("allows previewing the red doudou card while keeping it unavailable", async () => {
    const { ThemeSelectionScreen } = await loadOnboarding();
    const html = renderToStaticMarkup(createElement(ThemeSelectionScreen, {
      onContinue: noop,
      onSelect: noop,
      selectedThemeId: "eastern_observation",
    }));

    expect(html.match(/onboarding-theme-card/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html.match(/<img/g)).toHaveLength(4);
    expect(html).toContain("我是龙");
    expect(html).toContain("查看鸿运当头主题预览，暂未开放");
    expect(html).toContain("选择我是龙主题");
    expect(html).toContain("选择吉星高照主题");
    expect(html).toContain("选择孙哥主题");
    expect(html.match(/暂未开放/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain("theme-card-2.webp");
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("focuses the selected doudou theme details", async () => {
    const { ThemeSelectionScreen } = await loadOnboarding();
    const html = renderToStaticMarkup(createElement(ThemeSelectionScreen, {
      onContinue: noop,
      onSelect: noop,
      selectedThemeId: "jixing_doudou",
    }));

    expect(html).toContain('data-focused="3"');
    expect(html).toContain("当前主题");
    expect(html).toContain("吉星高照");
  });

  it("keeps manual and screenshot sources as honest inline placeholders", async () => {
    const { SourceSelectionScreen } = await loadOnboarding();
    const html = renderToStaticMarkup(createElement(SourceSelectionScreen, {
      onBack: noop,
      onChooseRandom: noop,
      onPlaceholder: noop,
      placeholderMessage: null,
    }));

    expect(html.match(/onboarding-source-option/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("生成体验持仓");
    expect(html).toContain("手动填写持仓");
    expect(html).toContain("截图识别持仓");
    expect(html.match(/即将开放/g)).toHaveLength(2);
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("<form");
  });

  it("shows the random instrument holding, its draft state, and four constraints", async () => {
    const { ExperienceSummaryScreen } = await loadOnboarding();
    const identity = createDemoExperienceFromSeed(
      47,
      () => new Date("2026-07-25T08:00:00.000Z"),
    );
    const html = renderToStaticMarkup(createElement(ExperienceSummaryScreen, {
      identity,
      onBack: noop,
      onConfirm: noop,
      onReroll: noop,
    }));

    expect(html).toContain("随机模拟数据已出炉");
    expect(html).toContain("本次模拟持仓");
    expect(html).toContain("持仓尺度");
    expect(html).toContain("数据状态");
    expect(html).toContain("等待复盘");
    expect(html).toContain("数据日期");
    expect(html).toContain("数据来源");
    expect(html).toContain("随机生成");
    expect(html).toContain("本次模拟偏好");
    expect(html).toContain("投资期限");
    expect(html).toContain("近期流动性需求");
    expect(html).toContain("可承受回撤");
    expect(html).toContain("投资目标");
    expect(html).toContain("上一步");
    expect(html).toContain("换一份");
  });

  it("starts every visit at the splash and marks returning workspaces", async () => {
    const { OnboardingFlow } = await loadOnboarding();
    const storage = new MemoryStorage();
    markOnboardingCompleted(storage, "ws-returning", "2026-07-25T08:00:00.000Z");

    const returning = renderToStaticMarkup(createElement(OnboardingFlow, {
      onEnterApp: noop,
      storage,
      workspaceId: "ws-returning",
    }));
    const firstRun = renderToStaticMarkup(createElement(OnboardingFlow, {
      onEnterApp: noop,
      storage,
      workspaceId: "ws-new",
    }));

    expect(returning).toContain('data-visit="returning"');
    expect(returning).toContain("onboarding-splash--returning");
    expect(returning).toContain("数据有剧情，复盘不无聊");
    expect(firstRun).toContain('data-visit="first"');
    expect(firstRun).toContain('data-step="s0"');
    expect(firstRun).toContain("数据有剧情，复盘不无聊");
  });
});

describe("onboarding responsive and motion styles", () => {
  const stylesheet = readFileSync("src/features/onboarding/styles.css", "utf8");

  it("keeps compact controls, independent source options, and the summary safe area", () => {
    expect(stylesheet).toContain("position: fixed;");
    expect(stylesheet).toContain("env(safe-area-inset-bottom)");
    expect(stylesheet).toContain("grid-template-rows: auto minmax(20rem, 1fr) auto auto;");
    expect(stylesheet).toContain(".onboarding-source__options");
    expect(stylesheet).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(stylesheet).toContain("height: calc(5rem + env(safe-area-inset-bottom));");
    expect(stylesheet).toContain("touch-action: manipulation;");
    expect(stylesheet).not.toContain("translate3d(0, 70vh, 0)");
  });

  it("supports 375, 768, 1280 and reduced-motion layouts without viewport-scaled type", () => {
    expect(stylesheet).toContain("@media (max-width: 22rem)");
    expect(stylesheet).toContain("@media (min-width: 48rem)");
    expect(stylesheet).toContain("@media (min-width: 80rem)");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain(".onboarding--reduced-motion");
    expect(stylesheet).not.toMatch(/font-size\s*:[^;]*(?:vw|vh|vmin|vmax)/);
    expect(stylesheet).not.toMatch(/(?:linear|radial|conic)-gradient/);
    expect(stylesheet).not.toMatch(/transition\s*:\s*all/);
    expect(stylesheet).not.toMatch(/backdrop-filter/);
  });
});
