import { describe, expect, it } from "vitest";
import { THEME_IDS, THEMES, personaIdForTheme } from "../../src/theme/index.js";

describe("theme catalog", () => {
  it("registers all shipped themes with distinct tokens and twenty danmaku lines", () => {
    expect(THEME_IDS).toEqual([
      "eastern_observation", "jixing_doudou", "sunge", "zhouli",
      "tieba_laoge", "male_succubus", "female_succubus",
    ]);
    expect(new Set(THEME_IDS.map((id) => THEMES[id].tokens.background)).size).toBe(THEME_IDS.length);
    expect(new Set(THEME_IDS.map((id) => THEMES[id].tokens.accent)).size).toBe(THEME_IDS.length);
    for (const id of THEME_IDS) {
      expect(THEMES[id].copy.danmaku).toHaveLength(20);
      expect(new Set(THEMES[id].copy.danmaku).size).toBe(20);
    }
  });

  it("maps each theme to the matching finalized persona skill", () => {
    expect(personaIdForTheme("eastern_observation")).toBe("nailong");
    expect(personaIdForTheme("jixing_doudou")).toBe("doudou");
    expect(personaIdForTheme("sunge")).toBe("sunge");
    expect(personaIdForTheme("zhouli")).toBe("zhouli");
    expect(personaIdForTheme("tieba_laoge")).toBe("tieba_laoge");
    expect(personaIdForTheme("male_succubus")).toBe("male_succubus");
    expect(personaIdForTheme("female_succubus")).toBe("female_succubus");
  });
});
