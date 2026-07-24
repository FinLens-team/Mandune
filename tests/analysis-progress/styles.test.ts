import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const STYLES_PATH = new URL("../../src/features/analysis-progress/styles.css", import.meta.url);

describe("analysis progress motion and responsive styles", () => {
  it("uses shared tokens, responsive bounds, and explicit motion stop selectors", async () => {
    const css = await readFile(STYLES_PATH, "utf8");

    expect(css).toContain("width: min(100%, 40rem)");
    expect(css).toContain("@media (min-width: 48rem)");
    expect(css).toContain("@media (max-width: 23.4375rem)");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('[data-animation-active="false"]');
    expect(css).toContain('[data-reduce-motion="true"]');
    expect(css).toContain("animation: none");
    expect(css).toContain("var(--duration-base)");
    expect(css).not.toMatch(/transition:\s*all/);
  });
});
