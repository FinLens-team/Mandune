import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("S10 responsive, text, and motion styles", () => {
  it("keeps a 768px reading axis and covers 375/768/1280 acceptance breakpoints", async () => {
    const css = await readFile(
      new URL("../../src/features/history-view/styles.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain("width: min(100%, 48rem)");
    expect(css).toContain("@media (min-width: 48rem)");
    expect(css).toContain("@media (min-width: 80rem)");
    expect(css).toContain("@media (max-width: 23.4375rem)");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("min-height: var(--icon-control-size)");
    expect(css).toContain("border-top: 1px solid var(--color-border-subtle)");
    expect(css).not.toContain("history-eyebrow");
  });

  it("removes transitions for system and in-product reduced motion", async () => {
    const css = await readFile(
      new URL("../../src/features/history-view/styles.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain('.history-about[data-reduce-motion="true"]');
    expect(css).toContain("transition: none");
  });
});
