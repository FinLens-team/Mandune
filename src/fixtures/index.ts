/**
 * Versioned deterministic fixtures for Demo V1.
 * Explicitly example data — never claim provider cache or live market status.
 */

import { validateAnalysisResult, validatePortfolioSnapshot } from "../contracts/index.js";
import { fixtureHash, stableStringify } from "./hash.js";
import {
  FIXTURE_INDEX,
  FIXTURES,
  type AnalysisFixture,
  type FixtureScenarioId,
} from "./scenarios.js";

export { fixtureHash, stableStringify } from "./hash.js";
export {
  FIXTURE_INDEX,
  FIXTURES,
  type AnalysisFixture,
  type FixtureScenarioId,
} from "./scenarios.js";

export interface ReplayResult {
  scenario_id: FixtureScenarioId;
  seed: string;
  contracts_version: string;
  fixture_hash: string;
  analysis_status: AnalysisFixture["analysis"]["status"];
  snapshot_ok: boolean;
  analysis_ok: boolean;
}

export function listFixtureScenarios(): FixtureScenarioId[] {
  return Object.keys(FIXTURES) as FixtureScenarioId[];
}

export function getFixture(scenarioId: FixtureScenarioId): AnalysisFixture {
  const fixture = FIXTURES[scenarioId];
  if (!fixture) {
    throw new Error(`Unknown fixture scenario: ${scenarioId}`);
  }
  return fixture;
}

export function hashFixture(scenarioId: FixtureScenarioId): string {
  return fixtureHash(getFixture(scenarioId));
}

/**
 * Deterministic replay: re-read fixture, re-validate, re-hash.
 * Same scenario + contracts version must yield the same hash and status.
 */
export function replayFixture(scenarioId: FixtureScenarioId): ReplayResult {
  const fixture = getFixture(scenarioId);
  const snapshot = validatePortfolioSnapshot(fixture.snapshot);
  const analysis = validateAnalysisResult(fixture.analysis);
  return {
    scenario_id: fixture.scenario_id,
    seed: fixture.seed,
    contracts_version: fixture.contracts_version,
    fixture_hash: fixtureHash(fixture),
    analysis_status: fixture.analysis.status,
    snapshot_ok: snapshot.ok,
    analysis_ok: analysis.ok,
  };
}

export function replayAllFixtures(): ReplayResult[] {
  return listFixtureScenarios().map((id) => replayFixture(id));
}

/** Serialize fixture index for documentation or handoff without private holdings. */
export function serializeFixtureIndex(): string {
  return stableStringify(FIXTURE_INDEX);
}
