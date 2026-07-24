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

  it("keeps about copy and destructive controls robust on narrow/text-enlarged layouts", async () => {
    const css = await readFile(
      new URL("../../src/features/about/styles.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain("grid-template-columns: 24px minmax(0, 1fr)");
    expect(css).toContain("@media (max-width: 23.4375rem)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain("width: 100%");
    expect(css).toContain("overflow-wrap: anywhere");
  });
});
