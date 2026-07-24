import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../src/fixtures/index.js";

describe("long-card fixture boundary", () => {
  it("keeps the front and evidence view bound to the same analysis identifiers", () => {
    const fixture = FIXTURES.limited_partial;
    expect(fixture.analysis.snapshot_id).toBe(fixture.snapshot.snapshot_id);
    expect(fixture.analysis.contracts_version).toBe(fixture.snapshot.contracts_version);
    expect(fixture.analysis.conclusions.every((conclusion) => conclusion.refs.length > 0)).toBe(true);
    expect(fixture.analysis.advice.every((advice) => advice.trigger_refs.length > 0)).toBe(true);
    expect(fixture.analysis.theme_id).toBe(fixture.snapshot.theme_id);
  });

  it("keeps unavailable data out of the normal long-card result set", () => {
    const renderable = Object.values(FIXTURES).filter(
      (fixture) => fixture.analysis.status !== "unavailable",
    );
    expect(renderable).toHaveLength(3);
    expect(FIXTURES.unavailable_no_evidence.analysis.recovery_actions).toHaveLength(2);
  });

  it("keeps every rendered status honest about available conclusions and advice", () => {
    expect(FIXTURES.supported_full.analysis.advice.length).toBeGreaterThan(0);
    expect(FIXTURES.limited_partial.analysis.unknowns.length).toBeGreaterThan(0);
    expect(FIXTURES.observation_only_gaps.analysis.advice).toHaveLength(0);
    expect(FIXTURES.unavailable_no_evidence.analysis.conclusions).toHaveLength(0);
  });
});
