import type { AssetClass, EvidenceRecord, EvidenceStatus } from "../contracts/index.js";
import {
  normalizePandaMarketRows,
  unavailableMarketEvidence,
  type MarketEvidenceRequest,
  type PandaMarketRow,
} from "../evidence/index.js";

export type PandaCallStatus =
  | "available"
  | "empty"
  | "stale"
  | "ambiguous"
  | "unsupported"
  | "conflicting"
  | "rate_limited"
  | "failed";

export interface PandaMarketDataResponse {
  status: PandaCallStatus;
  rows: readonly PandaMarketRow[];
  limitation?: string;
}

/**
 * Protected server implementation boundary for the methods accepted in MD-002.
 * It intentionally excludes provider SDK types and credentials from contracts.
 */
export interface PandaAIClient {
  getAShareMarketData(input: {
    symbol: string;
    latestCompleteTradingDay: string;
    signal: AbortSignal;
  }): Promise<PandaMarketDataResponse>;
}

export interface PandaEvidenceRequest extends MarketEvidenceRequest {
  assetClass: AssetClass;
  signal: AbortSignal;
}

function mappedStatus(status: PandaCallStatus): EvidenceStatus {
  switch (status) {
    case "rate_limited":
      return "rate_limited";
    case "unsupported":
      return "unsupported";
    case "conflicting":
      return "conflicting";
    case "stale":
      return "stale";
    case "ambiguous":
    case "empty":
      return "ambiguous";
    default:
      return "failed";
  }
}

export class PandaEvidenceAdapter {
  constructor(private readonly client: PandaAIClient) {}

  async collectMarketEvidence(request: PandaEvidenceRequest): Promise<EvidenceRecord[]> {
    if (request.assetClass !== "a_share") {
      return [
        unavailableMarketEvidence(
          request,
          "unsupported",
          request.assetClass === "etf"
            ? "ETF market-data windows returned no rows in MD-002; ETF market coverage is not accepted."
            : "Off-exchange fund market data was rejected by the verified PandaAI method; market coverage is not accepted.",
        ),
      ];
    }

    try {
      const response = await this.client.getAShareMarketData({
        symbol: request.symbol,
        latestCompleteTradingDay: request.latestCompleteTradingDay,
        signal: request.signal,
      });

      if (response.status === "available" && response.rows.length > 0) {
        return normalizePandaMarketRows(request, response.rows);
      }

      return [
        unavailableMarketEvidence(
          request,
          mappedStatus(response.status),
          response.limitation ?? "PandaAI did not return usable A-share market data.",
        ),
      ];
    } catch (error) {
      const wasAborted = request.signal.aborted;
      return [
        unavailableMarketEvidence(
          request,
          "failed",
          wasAborted
            ? "PandaAI request was cancelled before market evidence was available."
            : `PandaAI request failed without usable market evidence (${error instanceof Error ? error.name : "unknown error"}).`,
        ),
      ];
    }
  }
}
