import { describe, expect, it } from "vitest";
import { THEME_IDS, THEMES, personaIdForTheme } from "../../src/theme/index.js";

describe("theme catalog", () => {
  it("registers the three shipped themes with distinct tokens and twenty danmaku lines", () => {
    expect(THEME_IDS).toEqual(["eastern_observation", "jixing_doudou", "sunge"]);
    expect(new Set(THEME_IDS.map((id) => THEMES[id].tokens.background)).size).toBe(3);
    expect(new Set(THEME_IDS.map((id) => THEMES[id].tokens.accent)).size).toBe(3);
    for (const id of THEME_IDS) {
      expect(THEMES[id].copy.danmaku).toHaveLength(20);
      expect(new Set(THEMES[id].copy.danmaku).size).toBe(20);
    }
  });

  it("maps each theme to the matching finalized persona skill", () => {
    expect(personaIdForTheme("eastern_observation")).toBe("nailong");
    expect(personaIdForTheme("jixing_doudou")).toBe("doudou");
    expect(personaIdForTheme("sunge")).toBe("sunge");
  });
});
