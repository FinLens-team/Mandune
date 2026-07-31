import type { EvidenceRecord } from "../contracts/index.js";
import type { MarketEvidenceSource } from "../analysis/index.js";

type FetchLike = typeof fetch;

/**
 * Keyless public daily-kline upstream used to widen live
 * A-share / exchange-traded fund coverage beyond the deterministic fixtures.
 * Off-exchange funds stay unsupported because this endpoint does not publish a
 * verifiable, unit-declared NAV for them.
 */
const TENCENT_KLINE_ENDPOINT = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
const DEFAULT_TIMEOUT_MS = 8_000;
const REQUIRED_TRADING_DAYS = 3;
const REQUESTED_TRADING_DAYS = 260;

function evidenceId(lineId: string, suffix: string): string {
  return `tencent-market-${lineId}-${suffix}`;
}

/** Resolve a normalized six-digit code plus a Tencent market prefix. */
function tencentCode(symbol: string): string | undefined {
  const trimmed = symbol.trim().toUpperCase();
  const [rawCode = "", rawSuffix = ""] = trimmed.includes(".")
    ? trimmed.split(".", 2)
    : [trimmed, ""];
  const code = rawCode.replace(/[^0-9]/g, "");
  if (code.length !== 6) return undefined;

  const suffixPrefix =
    rawSuffix === "SH" ? "sh" : rawSuffix === "SZ" ? "sz" : rawSuffix === "BJ" ? "bj" : "";
  if (suffixPrefix) return `${suffixPrefix}${code}`;

  const lead = code[0];
  if (lead === "6" || lead === "5" || lead === "9") return `sh${code}`;
  if (lead === "0" || lead === "3" || lead === "1" || lead === "2") return `sz${code}`;
  if (lead === "4" || lead === "8") return `bj${code}`;
  return undefined;
}

interface ParsedKline {
  close: number;
  observedDate: string;
}

function parseKlines(payload: unknown, code: string, cutoff: string): ParsedKline[] {
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return [];
  const instrument = (data as Record<string, unknown>)[code];
  if (typeof instrument !== "object" || instrument === null) return [];
  const source = instrument as { qfqday?: unknown; day?: unknown };
  const rows = Array.isArray(source.qfqday) ? source.qfqday : Array.isArray(source.day) ? source.day : [];
  const byDate = new Map<string, ParsedKline>();
  for (const row of rows) {
    if (!Array.isArray(row) || typeof row[0] !== "string") continue;
    const observedDate = row[0];
    const close = Number(row[2]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observedDate) || observedDate > cutoff ||
      !Number.isFinite(close) || close <= 0) continue;
    byDate.set(observedDate, { observedDate, close });
  }
  return [...byDate.values()]
    .sort((left, right) => left.observedDate.localeCompare(right.observedDate))
    .slice(-REQUESTED_TRADING_DAYS);
}

export class TencentMarketEvidenceSource implements MarketEvidenceSource {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async collectMarketEvidence(input: {
    lineId: string;
    assetClass: "fund" | "etf" | "a_share";
    symbol: string;
    acquiredAt: string;
    latestCompleteTradingDay: string;
    signal: AbortSignal;
  }): Promise<EvidenceRecord[]> {
    const scope = { kind: "asset" as const, line_id: input.lineId, symbol: input.symbol };

    if (input.assetClass === "fund") {
      return [
        {
          id: evidenceId(input.lineId, input.latestCompleteTradingDay),
          scope,
          metric_or_event_type: "nav",
          value: null,
          source: { name: "腾讯行情 qt.gtimg.cn", locator: `tencent:qt:${input.symbol}` },
          observation_or_event_time: input.latestCompleteTradingDay,
          fetched_at: input.acquiredAt,
          status: "unsupported",
          limitations: [
            "场外基金没有可核验单位的公开实时净值，实时行情源不支持该资产类别。",
          ],
          provenance: "observed",
        },
      ];
    }

    const code = tencentCode(input.symbol);
    if (!code) {
      return [
        {
          id: evidenceId(input.lineId, input.latestCompleteTradingDay),
          scope,
          metric_or_event_type: "close",
          value: null,
          source: { name: "腾讯行情 qt.gtimg.cn", locator: `tencent:qt:${input.symbol}` },
          observation_or_event_time: input.latestCompleteTradingDay,
          fetched_at: input.acquiredAt,
          status: "ambiguous",
          limitations: ["无法把该资产代码解析为可查询的交易所行情代码。"],
          provenance: "observed",
        },
      ];
    }

    try {
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const query = new URLSearchParams({ param: `${code},day,,,${REQUESTED_TRADING_DAYS},qfq` });
      const response = await this.fetchImpl(`${TENCENT_KLINE_ENDPOINT}?${query}`, {
        method: "GET",
        signal: AbortSignal.any([input.signal, timeout]),
      });
      if (!response.ok) {
        return [this.failedEvidence(input, scope, `行情服务返回 HTTP ${response.status}。`)];
      }
      const rows = parseKlines(await response.json(), code, input.latestCompleteTradingDay);
      if (rows.length < REQUIRED_TRADING_DAYS) {
        return [this.failedEvidence(input, scope, "行情响应不足三个有效交易日，无法形成涨跌分析。")];
      }

      const latestDate = rows.at(-1)!.observedDate;
      return rows.map((row) => {
        const isLatest = row.observedDate === latestDate;
        return {
          id: evidenceId(input.lineId, row.observedDate),
          scope,
          metric_or_event_type: "close",
          value: row.close,
          unit: "CNY",
          normalization_note: "unitless_return_eligible:same_provider_method",
          source: {
            name: "腾讯行情日 K",
            locator: `tencent:kline:${code}:${row.observedDate}`,
          },
          observation_or_event_time: row.observedDate,
          fetched_at: input.acquiredAt,
          status: isLatest ? "available" as const : "ambiguous" as const,
          limitations: isLatest
            ? [`最多 ${REQUESTED_TRADING_DAYS} 个有效交易日的收盘价来自公开延迟日 K 行情，单位按交易所人民币计价。`]
            : ["历史收盘价仅与同一行情方法的连续观察值共同用于派生涨跌幅和分层周期摘要。"],
          provenance: "observed" as const,
        };
      });
    } catch (error) {
      const cancelled = input.signal.aborted;
      return [
        this.failedEvidence(
          input,
          scope,
          cancelled
            ? "实时行情请求在获得收盘证据前被取消。"
            : `实时行情请求失败（${error instanceof Error ? error.name : "unknown"}）。`,
        ),
      ];
    }
  }

  private failedEvidence(
    input: { lineId: string; acquiredAt: string; latestCompleteTradingDay: string },
    scope: { kind: "asset"; line_id: string; symbol: string },
    limitation: string,
  ): EvidenceRecord {
    return {
      id: evidenceId(input.lineId, input.latestCompleteTradingDay),
      scope,
      metric_or_event_type: "close",
      value: null,
      source: { name: "腾讯行情日 K", locator: `tencent:kline:${scope.symbol}` },
      observation_or_event_time: input.latestCompleteTradingDay,
      fetched_at: input.acquiredAt,
      status: "failed",
      limitations: [limitation],
      provenance: "observed",
    };
  }
}
