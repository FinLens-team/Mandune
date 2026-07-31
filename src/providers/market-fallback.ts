import type { MarketEvidenceSource } from "../analysis/index.js";
import type { EvidenceRecord, PortfolioSnapshot } from "../contracts/index.js";
import type { CachedPandaEvidenceResult } from "./panda-cache.js";

interface MarketEvidenceCollector {
  collect(input: {
    snapshot: PortfolioSnapshot;
    tradingDay: string;
    signal: AbortSignal;
  }): Promise<CachedPandaEvidenceResult>;
}

const REQUIRED_TRADING_DAYS = 3;

function usableLineIds(evidence: readonly EvidenceRecord[]): Set<string> {
  const datesBySeries = new Map<string, Set<string>>();
  for (const item of evidence) {
    const eligible = item.status === "available" ||
      (item.status === "ambiguous" &&
        item.normalization_note === "unitless_return_eligible:same_provider_method");
    if ((item.metric_or_event_type === "close" || item.metric_or_event_type === "nav") &&
      eligible && item.scope.kind === "asset") {
      const key = `${item.scope.line_id}\u0000${item.metric_or_event_type}\u0000${item.source.name}`;
      const dates = datesBySeries.get(key) ?? new Set<string>();
      dates.add(item.observation_or_event_time.slice(0, 10));
      datesBySeries.set(key, dates);
    }
  }
  const ids = new Set<string>();
  for (const [key, dates] of datesBySeries) {
    if (dates.size >= REQUIRED_TRADING_DAYS) ids.add(key.split("\u0000", 1)[0]!);
  }
  return ids;
}

/**
 * 组合市场证据采集：先走主采集器（PandaAI 缓存批处理），对没有可用
 * close/nav 证据的持仓再用免鉴权公开行情源逐项补齐。补到可用证据的持仓
 * 从失败清单移除，让 Demo 主路径尽可能带真实数据进入模型生成。
 */
export class FallbackMarketEvidenceSource implements MarketEvidenceSource {
  constructor(
    private readonly primary: MarketEvidenceSource,
    private readonly fallback: MarketEvidenceSource,
  ) {}

  async collectMarketEvidence(input: Parameters<MarketEvidenceSource["collectMarketEvidence"]>[0]): Promise<EvidenceRecord[]> {
    const primary = await this.primary.collectMarketEvidence(input);
    const usable = primary.filter((item) =>
      (item.status === "available" || (item.status === "ambiguous" &&
        item.normalization_note === "unitless_return_eligible:same_provider_method")) &&
      (item.metric_or_event_type === "close" || item.metric_or_event_type === "nav"));
    if (new Set(usable.map((item) => item.observation_or_event_time.slice(0, 10))).size >= 3) {
      return primary;
    }
    return [...primary, ...await this.fallback.collectMarketEvidence(input)];
  }
}

/**
 * Combine the protected collector with a source-level fallback while preserving
 * the collector contract used by the strict V2 executor.
 */
export class SupplementedMarketEvidenceCollector implements MarketEvidenceCollector {
  constructor(
    private readonly primary: MarketEvidenceCollector,
    private readonly supplement: MarketEvidenceSource,
  ) {}

  async collect(input: {
    snapshot: PortfolioSnapshot;
    tradingDay: string;
    signal: AbortSignal;
  }): Promise<CachedPandaEvidenceResult> {
    let base: CachedPandaEvidenceResult;
    try {
      base = await this.primary.collect(input);
    } catch {
      base = {
        evidence: [],
        failures: input.snapshot.lines.map((line) => ({
          lineId: line.line_id,
          status: "failed" as const,
          errorCode: "primary_collector_failed",
        })),
      };
    }

    const covered = usableLineIds(base.evidence);
    const gaps = input.snapshot.lines.filter((line) => !covered.has(line.line_id));
    if (gaps.length === 0) return base;

    const batches = await Promise.all(gaps.map((line) =>
      this.supplement.collectMarketEvidence({
        lineId: line.line_id,
        assetClass: line.asset_class,
        symbol: line.symbol,
        acquiredAt: new Date().toISOString(),
        latestCompleteTradingDay: input.tradingDay,
        signal: input.signal,
      }).catch(() => [] as EvidenceRecord[]),
    ));
    const extras = batches.flat();
    const supplemented = usableLineIds(extras);

    return {
      evidence: [...base.evidence, ...extras],
      failures: base.failures.filter((failure) => !supplemented.has(failure.lineId)),
    };
  }
}
