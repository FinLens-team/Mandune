import type { MarketEvidenceSource } from "../../analysis/index.js";
import type { DraftLine, EvidenceRecord } from "../../contracts/index.js";
import { createRandomExampleLines } from "../../portfolio/index.js";

export interface RandomExampleValuationSource {
  kind: "public_delayed" | "local_fallback";
  /** Public daily bars are deliberately not described as a real-time quote. */
  is_live: false;
  name: string;
  locator: string;
  observation_date: string;
  historical_observation_date: string;
  current_price_cny: number;
  historical_price_cny: number;
  limitations: string[];
}

export interface RandomExampleValuation {
  current_market_value_cny: number;
  cost_basis_cny: number;
  cash_balance_cny: number;
  position_units: number;
  source: RandomExampleValuationSource;
}

export interface ServerRandomExample {
  line: DraftLine;
  valuation: RandomExampleValuation;
}

export interface RandomExampleValuationServiceOptions {
  marketEvidenceSource: MarketEvidenceSource;
  now?: () => Date;
  random?: () => number;
  createLineId?: () => string;
}

function pickNumber(random: () => number, minimum: number, maximum: number): number {
  return minimum + random() * (maximum - minimum);
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function previousTradingDay(now: Date): string {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  // A daily close is only treated as complete after its calendar day has passed.
  date.setUTCDate(date.getUTCDate() - 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function pricedRows(records: readonly EvidenceRecord[]): EvidenceRecord[] {
  return records
    .filter((record) =>
      (record.metric_or_event_type === "close" || record.metric_or_event_type === "nav") &&
      (record.status === "available" || record.status === "ambiguous") &&
      typeof record.value === "number" && Number.isFinite(record.value) && record.value > 0,
    )
    .sort((left, right) => left.observation_or_event_time.localeCompare(right.observation_or_event_time));
}

function publicPricing(records: readonly EvidenceRecord[]): RandomExampleValuationSource | undefined {
  const rows = pricedRows(records);
  const latest = [...rows].reverse().find((record) => record.status === "available");
  if (!latest || typeof latest.value !== "number") return undefined;
  const compatibleHistory = rows.filter((record) =>
    record.source.name === latest.source.name &&
    record.metric_or_event_type === latest.metric_or_event_type &&
    record.observation_or_event_time < latest.observation_or_event_time,
  );
  // Prefer a roughly one-month-old close, but accept the oldest compatible row
  // from a shorter provider series rather than mixing provider/method values.
  const historical = compatibleHistory.at(Math.max(0, compatibleHistory.length - 21));
  if (!historical || typeof historical.value !== "number") return undefined;
  return {
    kind: "public_delayed",
    is_live: false,
    name: latest.source.name,
    locator: latest.source.locator,
    observation_date: latest.observation_or_event_time.slice(0, 10),
    historical_observation_date: historical.observation_or_event_time.slice(0, 10),
    current_price_cny: money(latest.value),
    historical_price_cny: money(historical.value),
    limitations: [
      "估值使用公开日线/净值的已观测价格，不是实时盘口或可交易报价。",
      ...latest.limitations,
    ],
  };
}

function localFallbackPricing(line: DraftLine, random: () => number, now: Date): RandomExampleValuationSource {
  const currentPrice = line.asset_class === "fund"
    ? pickNumber(random, 0.8, 2.6)
    : line.asset_class === "etf"
      ? pickNumber(random, 1.5, 8)
      : pickNumber(random, 8, 80);
  const change = pickNumber(random, -0.16, 0.16);
  const historicalPrice = currentPrice / (1 + change);
  const date = now.toISOString().slice(0, 10);
  return {
    kind: "local_fallback",
    is_live: false,
    name: "本地演示估值（非实时行情）",
    locator: "local:random-example-valuation",
    observation_date: date,
    historical_observation_date: date,
    current_price_cny: money(currentPrice),
    historical_price_cny: money(historicalPrice),
    limitations: [
      "公开行情未返回可用价格；以下价格、成本和现金均为本地生成的演示值，不是市场数据。",
      "本地 fallback 只保证示例内部算术一致，不可用于交易、净值或账户判断。",
    ],
  };
}

function valuationFromPricing(
  line: DraftLine,
  source: RandomExampleValuationSource,
  random: () => number,
): RandomExampleValuation {
  const positionUnits = line.asset_class === "fund"
    ? 1_000 * (1 + Math.floor(random() * 8))
    : 100 * (1 + Math.floor(random() * 8));
  const currentMarketValue = money(positionUnits * source.current_price_cny);
  const costBasis = money(positionUnits * source.historical_price_cny);
  const cashRatio = pickNumber(random, 0.08, 0.3);
  return {
    position_units: positionUnits,
    current_market_value_cny: currentMarketValue,
    cost_basis_cny: costBasis,
    cash_balance_cny: money(currentMarketValue * cashRatio / (1 - cashRatio)),
    source,
  };
}

/**
 * Generates a random, contract-valid example holding on the server. It asks an
 * existing market evidence source first and falls back only to a visibly local,
 * non-live simulation when it cannot obtain a compatible current+historical pair.
 */
export class RandomExampleValuationService {
  private readonly now: () => Date;
  private readonly random: () => number;

  constructor(private readonly options: RandomExampleValuationServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
  }

  async create(input: { excludedSymbols?: ReadonlySet<string> } = {}): Promise<ServerRandomExample | null> {
    const createdAt = this.now();
    const [generated] = createRandomExampleLines({
      random: this.random,
      now: createdAt,
      excludedSymbols: input.excludedSymbols,
      createLineId: this.options.createLineId,
    });
    if (!generated) return null;
    const line: DraftLine = { ...generated, entry_method: "example" };
    let records: EvidenceRecord[] = [];
    try {
      records = await this.options.marketEvidenceSource.collectMarketEvidence({
        lineId: line.line_id,
        assetClass: line.asset_class,
        symbol: String(line.symbol),
        acquiredAt: createdAt.toISOString(),
        latestCompleteTradingDay: previousTradingDay(createdAt),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // The response itself keeps the fallback provenance explicit below.
    }
    const source = publicPricing(records) ?? localFallbackPricing(line, this.random, createdAt);
    const valuation = valuationFromPricing(line, source, this.random);
    return {
      line: {
        ...line,
        current_market_value_cny: valuation.current_market_value_cny,
        cost_basis_cny: valuation.cost_basis_cny,
      },
      valuation,
    };
  }
}
