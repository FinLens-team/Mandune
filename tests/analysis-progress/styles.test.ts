import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const STYLES_PATH = new URL("../../src/features/analysis-progress/styles.css", import.meta.url);

describe("analysis progress simple styles", () => {
  it("keeps the mascot centered with a bounded log and motion stop selectors", async () => {
    const css = await readFile(STYLES_PATH, "utf8");

    expect(css).toContain(".analysis-progress__mascot");
    expect(css).toContain("object-fit: contain");
    expect(css).toContain(".analysis-progress__log");
    expect(css).toContain("mascot-breathe");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain('[data-reduce-motion="true"]');
    expect(css).toContain("animation: none");
    expect(css).toContain("var(--duration-base)");
    expect(css).not.toMatch(/transition:\s*all/);
  });
});
