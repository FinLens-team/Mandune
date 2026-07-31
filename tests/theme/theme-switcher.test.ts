import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ThemeId } from "../../src/theme/index.js";

interface ThemeSwitcherModule {
  ThemeSwitcher: ComponentType<{
    currentThemeId: ThemeId;
    onConfirm: (themeId: ThemeId) => void;
    reducedMotion?: boolean;
  }>;
}

const THEME_SWITCHER_PATH = ["..", "..", "src", "features", "theme-switcher", "index.js"].join("/");

describe("workspace theme switcher", () => {
  it("shows all seven themes as peers and disables confirmation for the current theme", async () => {
    const { ThemeSwitcher } = await import(THEME_SWITCHER_PATH) as ThemeSwitcherModule;
    const markup = renderToStaticMarkup(createElement(ThemeSwitcher, {
      currentThemeId: "jixing_doudou",
      onConfirm: vi.fn(),
      reducedMotion: true,
    }));

    expect(markup).toContain("换个角色，继续看懂");
    expect(markup).toContain("我是龙");
    expect(markup).toContain("吉星高照");
    expect(markup).toContain("孙哥");
    expect(markup).toContain("周礼");
    expect(markup).toContain("贴吧老哥");
    expect(markup).toContain("男魅魔");
    expect(markup).toContain("女魅魔");
    expect(markup).toContain('aria-label="吉星高照，当前使用"');
    expect(markup).toContain('class="btn ui-button ui-button--primary primary theme-switcher__confirm" disabled=""');
    expect(markup).toContain("正在使用「吉星高照」");
    expect(markup).toContain('class="theme-switcher__decision"');
    expect(markup).not.toContain("<footer");
    expect(markup).not.toContain("暂未开放");
  });
});
