import { readFileSync } from "node:fs";
import {
  createElement,
  type ComponentType,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDemoExperienceFromSeed } from "../../src/demo-experience/index.js";
import {
  markOnboardingCompleted,
  type OnboardingStorage,
} from "../../src/features/onboarding/storage.js";
import type { DemoExperienceIdentity } from "../../src/demo-experience/index.js";

interface OnboardingModule {
  SplashScreen: ComponentType<{ onSkip: () => void }>;
  ThemeSelectionScreen: ComponentType<{
    selected: boolean;
    previewMessage: string | null;
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
    expect(html).toContain("跳过");
    expect(html).not.toContain("progress");
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
    expect(html.match(/暂未开放/g)).toHaveLength(3);
    expect(html).toContain("东方观象");
    expect(html).toContain("熊猫兜兜");
    expect(html).toContain("disabled=\"\"");
  });

  it("keeps manual and screenshot sources as honest inline placeholders", async () => {
    const { SourceSelectionScreen } = await loadOnboarding();
    const html = renderToStaticMarkup(createElement(SourceSelectionScreen, {
      onBack: noop,
      onChooseRandom: noop,
      onPlaceholder: noop,
      placeholderMessage: null,
    }));

    expect(html).toContain("先随便看看");
    expect(html).toContain("随机生成一份体验持仓与四项约束");
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
    expect(html).toContain("市场观察时间");
    expect(html).toContain("系统获取时间");
    expect(html).toContain("证据来源");
    expect(html).toContain("available · 测试 fixture · 非实时行情");
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

    expect(returning).toBe("");
    expect(firstRun).toContain("只给方向，不替你下单");
  });
});

describe("onboarding responsive and motion styles", () => {
  const stylesheet = readFileSync("src/features/onboarding/styles.css", "utf8");

  it("reserves the safe-area sticky bar and stable card/control geometry", () => {
    expect(stylesheet).toContain("position: fixed;");
    expect(stylesheet).toContain("env(safe-area-inset-bottom)");
    expect(stylesheet).toContain("min-height: 11.5rem;");
    expect(stylesheet).toContain("min-height: var(--control-height);");
    expect(stylesheet).toContain("touch-action: manipulation;");
  });

  it("supports 375, 768, 1280 and reduced-motion layouts without viewport-scaled type", () => {
    expect(stylesheet).toContain("@media (max-width: 23.4375rem)");
    expect(stylesheet).toContain("@media (min-width: 48rem)");
    expect(stylesheet).toContain("@media (min-width: 80rem)");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain(".onboarding--reduced-motion");
    expect(stylesheet).not.toMatch(/font-size\s*:[^;]*(?:vw|vh|vmin|vmax)/);
    expect(stylesheet).not.toMatch(/(?:linear|radial|conic)-gradient/);
  });
});
