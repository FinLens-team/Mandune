import type { MarketEvidenceSource } from "../analysis/index.js";
import type { EvidenceRecord } from "../contracts/index.js";

/**
 * Competition-safe default for the independent A2A boundary.
 *
 * The track forbids unapproved data services. Until a PandaAI Data Skill (or
 * another explicitly authorized source) is wired and accepted, the A2A agent
 * records a typed failure instead of falling through to a convenient public
 * quote endpoint.
 */
export class UnconfiguredAuthorizedMarketEvidenceSource implements MarketEvidenceSource {
  async collectMarketEvidence(
    input: Parameters<MarketEvidenceSource["collectMarketEvidence"]>[0],
  ): Promise<EvidenceRecord[]> {
    return [{
      id: `a2a-market-data-unconfigured-${input.lineId}`,
      scope: { kind: "asset", line_id: input.lineId, symbol: input.symbol },
      metric_or_event_type: input.assetClass === "fund" ? "nav" : "close",
      value: null,
      source: {
        name: "a2a-market-data-unconfigured",
        locator: `internal://a2a-market-data-unconfigured/${input.lineId}`,
      },
      observation_or_event_time: input.latestCompleteTradingDay,
      fetched_at: input.acquiredAt,
      status: "failed",
      limitations: [
        "赛事授权的结构化数据 Skill 尚未配置；未访问未授权第三方行情，也未制造当前值。",
      ],
      provenance: "observed",
    }];
  }
}
