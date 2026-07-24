import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Menu } from "lucide-react";
import { describe, expect, it } from "vitest";

type AnalysisStatusValue = "supported" | "limited" | "observation_only" | "unavailable";

interface UiModule {
  AnalysisStatus: ComponentType<{ status: AnalysisStatusValue }>;
  Button: ComponentType<{
    children?: ReactNode;
    disabled?: boolean;
    loading: boolean;
    loadingLabel: string;
  }>;
  DemoBadge: ComponentType;
  IconButton: ComponentType<{
    icon: typeof Menu;
    label: string;
    tooltip: string;
  }>;
  LockBadge: ComponentType;
}

const UI_MODULE_PATH = ["..", "..", "src", "client", "ui", "index.js"].join("/");

async function loadUi(): Promise<UiModule> {
  return (await import(UI_MODULE_PATH)) as UiModule;
}

describe("shared UI primitives", () => {
  it("renders the exact demo and lock labels with non-color cues", async () => {
    const { DemoBadge, LockBadge } = await loadUi();
    const demo = renderToStaticMarkup(createElement(DemoBadge));
    const locked = renderToStaticMarkup(createElement(LockBadge));

    expect(demo).toContain("随机体验身份 · 示例数据");
    expect(demo).toContain('data-tone="demo"');
    expect(demo).toContain('aria-hidden="true"');
    expect(locked).toContain("暂未开放");
    expect(locked).toContain('data-tone="locked"');
    expect(locked).toContain('aria-hidden="true"');
  });

  it("keeps the original button label in layout while exposing a named disabled loading state", async () => {
    const { Button } = await loadUi();
    const markup = renderToStaticMarkup(
      createElement(Button, { loading: true, loadingLabel: "正在保存" }, "保存更改"),
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("保存更改");
    expect(markup).toContain('role="status"');
    expect(markup).toContain("正在保存");

    const disabledMarkup = renderToStaticMarkup(
      createElement(Button, { disabled: true, loading: false, loadingLabel: "处理中" }, "不可操作"),
    );
    expect(disabledMarkup).toContain("disabled");
    expect(disabledMarkup).not.toContain('aria-busy="true"');
  });

  it("renders a named 20px Lucide icon button with a keyboard-reachable tooltip", async () => {
    const { IconButton } = await loadUi();
    const markup = renderToStaticMarkup(
      createElement(IconButton, {
        icon: Menu,
        label: "打开菜单",
        tooltip: "打开导航菜单",
      }),
    );

    expect(markup).toContain('aria-label="打开菜单"');
    expect(markup).toContain('aria-describedby=');
    expect(markup).toContain('role="tooltip"');
    expect(markup).toContain("打开导航菜单");
    expect(markup).toContain('width="20"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("renders all analysis result states with exact text, icons, and semantic state values", async () => {
    const { AnalysisStatus } = await loadUi();
    const states: Array<[AnalysisStatusValue, string, string]> = [
      ["supported", "证据支持", "当前证据支持全部物质性结论"],
      ["limited", "有限分析", "部分证据缺口限制了结论范围"],
      ["observation_only", "仅观察", "当前证据仅支持事实与观察项"],
      ["unavailable", "分析不可用", "当前证据不足以生成观象长笺"],
    ];

    for (const [status, label, description] of states) {
      const markup = renderToStaticMarkup(createElement(AnalysisStatus, { status }));
      expect(markup).toContain(`data-status="${status}"`);
      expect(markup).toContain('role="status"');
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain(label);
      expect(markup).toContain(description);
    }
  });
});
