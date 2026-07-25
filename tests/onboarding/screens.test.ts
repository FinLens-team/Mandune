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

interface OnboardingModule {
  SplashScreen: ComponentType<{ onSkip: () => void; returning?: boolean }>;
  ThemeSelectionScreen: ComponentType<{
    selected: boolean;
    previewMessage: string | null;
    previewIndex?: number | null;
    onSelect: () => void;
    onPreview: (index: number) => void;
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
  it("renders the concise S0 positioning and an immediately focusable skip control", async () => {
    const { SplashScreen } = await loadOnboarding();
    const html = renderToStaticMarkup(createElement(SplashScreen, { onSkip: noop }));

    expect(html).toContain("满懂");
    expect(html).toContain("只给方向，不替你下单");
    expect(html).toContain("<button");
    expect(html).toContain("autofocus");
    expect(html).toContain("跳过");
    expect(html).not.toContain("progress");

    const returning = renderToStaticMarkup(createElement(SplashScreen, {
      onSkip: noop,
      returning: true,
    }));
    expect(returning).toContain("满懂");
    expect(returning).not.toContain("只给方向，不替你下单");
  });

  it("exposes one selectable theme and three focusable locked previews", async () => {
    const { ThemeSelectionScreen } = await loadOnboarding();
    const html = renderToStaticMarkup(createElement(ThemeSelectionScreen, {
      onContinue: noop,
      onPreview: noop,
      onSelect: noop,
      previewMessage: null,
      selected: false,
    }));

    expect(html.match(/type="radio"/g)).toHaveLength(1);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(3);
    expect(html.match(/ui-badge--locked/g)).toHaveLength(3);
    expect(html.match(/<img/g)).toHaveLength(4);
    expect(html).toContain("东方观象");
    expect(html).toContain("熊猫兜兜");
    expect(html).toContain("当前可用");
    expect(html).toContain("选择东方观象");
    expect(html).toContain("主题预览 02");
    expect(html).toContain("主题预览 03");
    expect(html).toContain("主题预览 04");
    expect(html).toContain("theme-preview-1.png");
    expect(html).toContain("doudou-observer.png");
    expect(html).toContain("disabled=\"\"");
  });

  it("keeps locked theme details focusable without turning them into a selection", async () => {
    const { ThemeSelectionScreen } = await loadOnboarding();
    const html = renderToStaticMarkup(createElement(ThemeSelectionScreen, {
      onContinue: noop,
      onPreview: noop,
      onSelect: noop,
      previewIndex: 2,
      previewMessage: "主题预览 02 暂未开放；它只预览表现方向，不能用于下一步。",
      selected: true,
    }));

    expect(html.match(/type="radio"/g)).toHaveLength(1);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("只预览表现方向，不能用于下一步");
    expect(html).not.toContain("disabled=\"\" type=\"button\"");
  });

  it("keeps manual and screenshot sources as honest inline placeholders", async () => {
    const { SourceSelectionScreen } = await loadOnboarding();
    const html = renderToStaticMarkup(createElement(SourceSelectionScreen, {
      onBack: noop,
      onChooseRandom: noop,
      onPlaceholder: noop,
      placeholderMessage: null,
    }));

    expect(html).toContain("先体验一次");
    expect(html).toContain("生成体验持仓");
    expect(html).toContain("使用自己的持仓");
    expect(html).toContain("即将开放");
    expect(html).toContain("手工录入");
    expect(html).toContain("截图识别");
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("<form");
  });

  it("shows the full demo boundary, holding evidence times, and four constraints", async () => {
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

    expect(html).toContain("随机体验身份 · 示例数据");
    expect(html).toContain("测试 fixture · 非实时行情");
    expect(html).toContain("观察日期");
    expect(html).toContain("市场观察时间");
    expect(html).toContain("系统获取时间");
    expect(html).toContain("证据来源");
    expect(html).toContain("数据边界");
    expect(html).toContain(">available<");
    expect(html).toContain("observed");
    expect(html).toContain("投资期限");
    expect(html).toContain("近期流动性需求");
    expect(html).toContain("可承受回撤");
    expect(html).toContain("投资目标");
    expect(html).toContain("不是系统推荐的约束");
    expect(html).toContain("确认此体验身份");
  });

  it("skips first-run screens for a completed workspace", async () => {
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
    expect(returning).toContain("满懂");
    expect(returning).not.toContain("只给方向，不替你下单");
    expect(firstRun).toContain('data-visit="first"');
    expect(firstRun).toContain("只给方向，不替你下单");
  });
});

describe("onboarding responsive and motion styles", () => {
  const stylesheet = readFileSync("src/features/onboarding/styles.css", "utf8");

  it("reserves the safe-area sticky bar and stable card/control geometry", () => {
    expect(stylesheet).toContain("position: fixed;");
    expect(stylesheet).toContain("env(safe-area-inset-bottom)");
    expect(stylesheet).toContain("height: 17rem;");
    expect(stylesheet).toContain("min-height: var(--control-height);");
    expect(stylesheet).toContain("touch-action: manipulation;");
    expect(stylesheet).toContain("onboarding-theme-grid--list");
    expect(stylesheet).toContain("grid-area: 1 / 1;");
    expect(stylesheet).toContain("width: min(11rem, 56vw);");
    expect(stylesheet).toContain("translateX(-4.5rem)");
    expect(stylesheet).toContain(".onboarding-theme-card--locked.is-previewed");
    expect(stylesheet).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
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
    expect(stylesheet).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
