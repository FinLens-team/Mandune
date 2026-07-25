import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const STYLES_PATH = new URL("../../src/features/analysis-progress/styles.css", import.meta.url);

describe("analysis progress motion and responsive styles", () => {
  it("uses shared tokens, responsive bounds, and explicit motion stop selectors", async () => {
    const css = await readFile(STYLES_PATH, "utf8");

    expect(css).toContain(".analysis-progress__hero");
    expect(css).toContain("width: 100%");
    expect(css).not.toContain("box-shadow: 7px 20px 4px");
    expect(css).not.toContain("border-radius: 36px");
    expect(css).toContain("@media (min-width: 48rem)");
    expect(css).toContain("@media (max-width: 23.4375rem)");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('[data-animation-active="false"]');
    expect(css).toContain('[data-reduce-motion="true"]');
    expect(css).toContain("animation: none");
    expect(css).toContain("var(--duration-base)");
    expect(css).toContain(".analysis-progress__mascot");
    expect(css).toContain("object-fit: contain");
    expect(css).toContain("image-rendering: pixelated");
    expect(css).not.toContain("infinite");
    expect(css).not.toContain("analysis-guide-breathe");
    expect(css).not.toMatch(/transition:\s*all/);
  });
});
