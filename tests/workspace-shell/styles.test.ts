import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("workspace shell responsive and motion styles", () => {
  it("keeps the drawer bounded, animates it asymmetrically, and disables motion", async () => {
    const css = await readFile(
      new URL("../../src/features/workspace-shell/styles.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain("width: min(85vw, var(--workspace-drawer-width))");
    expect(css).toContain("@media (min-width: 48rem)");
    expect(css).toContain("@media (max-width: 23.4375rem)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain('[data-reduce-motion="true"] .workspace-home__hero');
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain('[data-state="closing"] .workspace-drawer');
    expect(css).toContain('[data-state="closing"] .analysis-confirm');
    // Drawer entry is a soft-spring 340ms; exit is a sharper, faster 200ms.
    expect(css).toContain("transition: transform 340ms cubic-bezier(0.3, 1.06, 0.36, 1)");
    expect(css).toContain("transition: transform 200ms cubic-bezier(0.55, 0, 0.75, 0.35)");
    expect(css).not.toContain("transition: all");
  });
});
