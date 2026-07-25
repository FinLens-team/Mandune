import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("workspace shell responsive and motion styles", () => {
  it("keeps the drawer bounded, provides desktop dialog treatment, and disables motion", async () => {
    const css = await readFile(
      new URL("../../src/features/workspace-shell/styles.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain("width: min(85vw, var(--drawer-width))");
    expect(css).toContain("@media (min-width: 48rem)");
    expect(css).toContain("@media (max-width: 23.4375rem)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain('[data-reduce-motion="true"] .workspace-mascot');
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain('[data-state="closing"] .workspace-drawer');
    expect(css).toContain('[data-state="closing"] .analysis-confirm');
    expect(css).toContain("top: var(--space-6)");
    expect(css).not.toContain("transition: all");
    expect(css).not.toContain("workspace-mascot__ear");
  });
});
