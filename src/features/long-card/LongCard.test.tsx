import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../fixtures/index.js";
import { LongCard, longCardFlipTarget } from "./LongCard.js";

describe("long-card rendering and interaction boundaries", () => {
  it("renders a button-accessible front face with an announced current side", () => {
    const markup = renderToStaticMarkup(createElement(LongCard, { fixture: FIXTURES.limited_partial }));
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("当前：东方观象");
    expect(markup).toContain("查看证据");
    expect(markup).toContain("横向拖动可翻面；也可使用此按钮切换。");
  });

  it("renders an unavailable result without a normal long-card stage", () => {
    const markup = renderToStaticMarkup(
      createElement(LongCard, { fixture: FIXTURES.unavailable_no_evidence }),
    );
    expect(markup).toContain("当前证据不足以生成观象长笺");
    expect(markup).not.toContain("long-card-stage");
  });

  it("flips only for a horizontal swipe and leaves vertical reading gestures alone", () => {
    expect(longCardFlipTarget({ x: 160, y: 20 }, { x: 80, y: 28 })).toBe(true);
    expect(longCardFlipTarget({ x: 80, y: 20 }, { x: 160, y: 28 })).toBe(false);
    expect(longCardFlipTarget({ x: 100, y: 20 }, { x: 112, y: 140 })).toBeNull();
    expect(longCardFlipTarget({ x: 160, y: 20 }, { x: 80, y: 140 })).toBeNull();
  });

  it("keeps a reduced-motion fallback and vertical touch panning in the stylesheet", () => {
    const stylesheet = readFileSync("src/client/styles.css", "utf8");
    expect(stylesheet).toContain("touch-action: pan-y");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
