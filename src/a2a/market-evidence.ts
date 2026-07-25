import type { MarketEvidenceSource } from "../analysis/index.js";
import type { EvidenceRecord, PortfolioSnapshot } from "../contracts/index.js";
import type {
  CachedPandaEvidenceCollector,
} from "../providers/index.js";

export class PandaAuthorizedMarketEvidenceSource implements MarketEvidenceSource {
  constructor(private readonly collector: Pick<CachedPandaEvidenceCollector, "collect">) {}

  async collectMarketEvidence(
    input: Parameters<MarketEvidenceSource["collectMarketEvidence"]>[0],
  ): Promise<EvidenceRecord[]> {
    const snapshot: PortfolioSnapshot = {
      snapshot_id: `a2a-${input.lineId}`,
      created_at: input.acquiredAt,
      contracts_version: "1.0.0",
      theme_id: "a2a",
      lines: [{
        line_id: input.lineId,
        asset_class: input.assetClass,
        name: input.symbol,
        symbol: input.symbol,
        size_basis: "unknown",
        observation_date: input.latestCompleteTradingDay,
        entry_method: "manual",
        confirmed_at: input.acquiredAt,
      }],
      constraints: {
        investment_horizon: "unknown",
        near_term_liquidity: "unknown",
        tolerable_drawdown: "unknown",
        investment_objective: "unknown",
      },
    };
    const result = await this.collector.collect({
      snapshot,
      tradingDay: input.latestCompleteTradingDay,
      signal: input.signal,
    });
    return result.evidence;
  }
}

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
