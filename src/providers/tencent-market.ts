import type { EvidenceRecord } from "../contracts/index.js";
import type { MarketEvidenceSource } from "../analysis/index.js";

type FetchLike = typeof fetch;

/**
 * Keyless public quote upstream (Tencent qt.gtimg.cn) used to widen live
 * A-share / exchange-traded fund coverage beyond the deterministic fixtures.
 * Off-exchange funds stay unsupported because this endpoint does not publish a
 * verifiable, unit-declared NAV for them.
 */
const TENCENT_QUOTE_ENDPOINT = "https://qt.gtimg.cn/q=";
const DEFAULT_TIMEOUT_MS = 8_000;

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

interface ParsedQuote {
  close: number;
  observedDate: string;
}

function parseQuote(payload: string): ParsedQuote | undefined {
  const quoted = /="([^"]*)"/.exec(payload);
  if (!quoted?.[1]) return undefined;
  const fields = quoted[1].split("~");
  const close = Number(fields[3]);
  if (!Number.isFinite(close) || close <= 0) return undefined;

  // The full quote carries a 14-digit YYYYMMDDhhmmss timestamp near the tail.
  const stamp = /(\d{4})(\d{2})(\d{2})\d{6}/.exec(quoted[1]);
  if (!stamp) return undefined;
  const observedDate = `${stamp[1]}-${stamp[2]}-${stamp[3]}`;
  if (Number.isNaN(Date.parse(`${observedDate}T00:00:00.000Z`))) return undefined;
  return { close, observedDate };
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
      const response = await this.fetchImpl(`${TENCENT_QUOTE_ENDPOINT}${code}`, {
        method: "GET",
        signal: AbortSignal.any([input.signal, timeout]),
      });
      if (!response.ok) {
        return [this.failedEvidence(input, scope, `行情服务返回 HTTP ${response.status}。`)];
      }
      const payload = await response.text();
      const parsed = parseQuote(payload);
      if (!parsed) {
        return [this.failedEvidence(input, scope, "行情响应缺少可用收盘价或观察日期。")];
      }

      const withinCutoff = parsed.observedDate <= input.latestCompleteTradingDay;
      const observationDate = parsed.observedDate;
      const isLatest = withinCutoff && observationDate === input.latestCompleteTradingDay;

      return [
        {
          id: evidenceId(input.lineId, observationDate),
          scope,
          metric_or_event_type: "close",
          value: parsed.close,
          unit: "CNY",
          source: {
            name: "腾讯行情 qt.gtimg.cn",
            locator: `tencent:qt:${code}:${observationDate}`,
          },
          observation_or_event_time: observationDate,
          fetched_at: input.acquiredAt,
          // A same-day close on the frozen latest complete trading day is
          // materially usable; anything older is preserved but downgraded by
          // the orchestrator's date normalization.
          status: isLatest ? "available" : withinCutoff ? "stale" : "ambiguous",
          limitations: isLatest
            ? ["收盘价来自公开延迟行情，单位按交易所人民币计价。"]
            : withinCutoff ? [
                "收盘价来自公开延迟行情，观察日不是冻结的最新完整交易日，不得支持物质性结论。",
              ] : [
                "行情观察日晚于本次证据截止日，仅记录缺口，不得作为本次分析证据。",
              ],
          provenance: "observed",
        },
      ];
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
      source: { name: "腾讯行情 qt.gtimg.cn", locator: `tencent:qt:${scope.symbol}` },
      observation_or_event_time: input.latestCompleteTradingDay,
      fetched_at: input.acquiredAt,
      status: "failed",
      limitations: [limitation],
      provenance: "observed",
    };
  }
}
