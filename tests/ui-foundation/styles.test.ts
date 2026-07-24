import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = [
  readFileSync("src/client/styles.css", "utf8"),
  readFileSync("src/client/ui/styles.css", "utf8"),
].join("\n");

const REQUIRED_TOKENS: Record<string, string> = {
  "--color-bg-base": "#f3f5f2",
  "--color-bg-surface": "#ffffff",
  "--color-bg-subtle": "#edf1ee",
  "--color-bg-letter": "#fffefa",
  "--color-text-primary": "#171a18",
  "--color-text-secondary": "#535b56",
  "--color-text-tertiary": "#69716c",
  "--color-text-disabled": "#8a928d",
  "--color-border-subtle": "#d7ddd9",
  "--color-border-strong": "#aeb8b2",
  "--color-observed": "#176b62",
  "--color-observed-bg": "#e3f2ee",
  "--color-risk": "#923d36",
  "--color-risk-bg": "#fff2ef",
  "--color-theme-accent": "#a77728",
  "--color-demo": "#365f8d",
  "--color-demo-bg": "#e9f0f7",
  "--color-focus": "#0a4d47",
  "--color-overlay": "rgb(23 26 24 / 48%)",
  "--space-1": "4px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--space-6": "24px",
  "--space-8": "32px",
  "--space-12": "48px",
  "--space-16": "64px",
  "--radius-sm": "4px",
  "--radius-md": "8px",
  "--radius-full": "999px",
  "--control-height": "48px",
  "--icon-control-size": "44px",
  "--content-reading": "680px",
  "--content-form": "920px",
  "--drawer-width": "320px",
  "--z-sticky": "20",
  "--z-backdrop": "40",
  "--z-drawer": "50",
  "--z-dialog": "60",
  "--z-toast": "70",
  "--z-tooltip": "80",
  "--font-size-xs": "12px",
  "--font-size-sm": "14px",
  "--font-size-base": "16px",
  "--font-size-lg": "18px",
  "--font-size-xl": "22px",
  "--font-size-2xl": "28px",
  "--shadow-paper": "0 2px 8px rgb(23 26 24 / 6%)",
  "--shadow-overlay": "0 12px 28px rgb(23 26 24 / 14%)",
  "--focus-ring": "0 0 0 3px rgb(10 77 71 / 28%)",
  "--duration-instant": "100ms",
  "--duration-fast": "150ms",
  "--duration-base": "220ms",
  "--duration-panel": "280ms",
  "--duration-flip": "360ms",
  "--ease-enter": "cubic-bezier(0.22, 1, 0.36, 1)",
  "--ease-move": "cubic-bezier(0.25, 1, 0.5, 1)",
  "--ease-standard": "cubic-bezier(0.65, 0, 0.35, 1)",
};

const PRESERVED_HOOKS = [
  ".shell",
  ".topbar",
  ".brand",
  ".workspace-status",
  ".intro",
  ".boundary",
  ".panel",
  ".panel-head",
  ".panel-note",
  ".action-row",
  ".btn",
  ".field",
  ".line-card",
  ".example-banner",
  ".long-card",
  ".analysis-status",
  ".theme-preview",
  ".doudou",
];

describe("visual foundation stylesheet", () => {
  it("declares the accepted token values exactly", () => {
    for (const [token, value] of Object.entries(REQUIRED_TOKENS)) {
      expect(stylesheet).toContain(`${token}: ${value};`);
    }
    expect(stylesheet).toContain("--font-sans:");
    expect(stylesheet).toContain("--font-serif:");
  });

  it("retains the existing App, review, and long-card style hooks", () => {
    for (const hook of PRESERVED_HOOKS) {
      expect(stylesheet).toContain(hook);
    }
  });

  it("provides visible focus, 44px icon controls, and 48px primary controls", () => {
    expect(stylesheet).toContain(":focus-visible");
    expect(stylesheet).toContain("outline: 2px solid var(--color-focus);");
    expect(stylesheet).toContain("box-shadow: var(--focus-ring);");
    expect(stylesheet).toContain("width: var(--icon-control-size);");
    expect(stylesheet).toContain("min-height: var(--control-height);");
  });

  it("keeps loading width stable and supports touch, reduced motion, and core viewports", () => {
    expect(stylesheet).toContain(".ui-button__label--loading");
    expect(stylesheet).toContain("visibility: hidden;");
    expect(stylesheet).toContain("touch-action: manipulation;");
    expect(stylesheet).toContain("touch-action: pan-y;");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain("@media (max-width: 23.4375rem)");
    expect(stylesheet).toContain("@media (min-width: 48rem)");
    expect(stylesheet).toContain("@media (min-width: 80rem)");
  });

  it("removes the superseded global visual patterns", () => {
    expect(stylesheet).not.toMatch(/(?:linear|radial|conic)-gradient/);
    expect(stylesheet).not.toContain("clamp(");
    expect(stylesheet).not.toMatch(/font-size\s*:[^;]*(?:vw|vh|vmin|vmax)/);
    expect(stylesheet).not.toContain("border-radius: 1rem");
    expect(stylesheet).not.toContain("border-radius: 0.75rem");
    expect(stylesheet).not.toContain("border-radius: 0.85rem");
  });
});
