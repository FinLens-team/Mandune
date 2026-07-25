import { describe, expect, it } from "vitest";
import { buildReviewPacket, deriveAnalysisInputs } from "../../src/analysis/index.js";
import type { AtlasCardV1 } from "../../src/atlas/types.js";
import { marketEvidence, snapshot, TRADING_DAY } from "./fixtures.js";

const card: AtlasCardV1 = {
  schema_version: "atlas-card.v1",
  card_id: "card-existing",
  kind: "professional_term",
  canonical_name: "组合集中度",
  aliases: ["集中暴露"],
  domain: "portfolio",
  scope_labels: [],
  appearance: "regular",
  visual_seed: "1234567890abcdef",
  generation_mode: "fixture",
  first_discovered_at: "2026-07-24T00:00:00.000Z",
  last_encountered_at: "2026-07-24T00:00:00.000Z",
  first_analysis_id: "analysis-old",
  first_history_record_id: "analysis-old",
  encounter_count: 1,
  professional: {
    plain_explanation: "资金是否集中在少数持仓。",
    why_today: "用于理解组合。",
    relation: "与组合有关。",
    misconception: "集中不等于一定亏损。",
    boundary: "不能预测未来涨跌。",
    reference_ids: ["market-line-1"],
  },
  meme: null,
};

describe("ReviewPacket v2", () => {
  it("assembles deterministic references, allowed numbers and minimal Atlas fingerprints", () => {
    const portfolio = snapshot();
    const evidence = [marketEvidence("line-2"), marketEvidence("line-1")];
    const derivations = deriveAnalysisInputs({
      snapshot: portfolio,
      evidence,
      latestCompleteTradingDay: TRADING_DAY,
    });
    const input = {
      analysisId: "analysis-v2",
      snapshot: portfolio,
      latestCompleteTradingDay: TRADING_DAY,
      evidenceCutoffAt: "2026-07-25T00:00:00.000Z",
      personaId: "nailong",
      evidence,
      derivations,
      selectedAtlasKind: "professional_term" as const,
      existingAtlasCards: [card],
    };

    const first = buildReviewPacket(input);
    expect(buildReviewPacket(input)).toEqual(first);
    expect(first).toMatchObject({
      schema_version: "review-packet.v2",
      analysis_id: "analysis-v2",
      persona_id: "nailong",
      atlas: { selected_kind: "professional_term" },
    });
    expect(first.fact_ids).toEqual([...first.fact_ids].sort());
    expect(first.fact_ids).toEqual(expect.arrayContaining([
      "line-1",
      "market-line-1",
      "constraint:investment_horizon",
      "concentration-top-1-share",
    ]));
    expect(first.allowed_numbers).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_id: "line-1", value: 60, unit: "%" }),
      expect.objectContaining({ source_id: "market-line-1", value: 10.5, unit: "CNY" }),
    ]));
    expect(first.atlas.existing_cards).toEqual([{
      card_id: "card-existing",
      kind: "professional_term",
      canonical_name: "组合集中度",
      aliases: ["集中暴露"],
      domain: "portfolio",
      core_meaning: "资金是否集中在少数持仓。 不能预测未来涨跌。",
    }]);
    expect(JSON.stringify(first)).not.toMatch(/encounter|first_discovered|visual_seed/);
  });
});
