import type { EvidenceRecord } from "../contracts/index.js";
import type { BochaCandidate } from "../providers/bocha.js";

export function unverifiedEventEvidence(input: {
  lineId: string;
  symbol: string;
  candidate: BochaCandidate;
  acquiredAt: string;
}): EvidenceRecord {
  const publishedAt = input.candidate.publishedAt;
  const observationTime =
    publishedAt && !Number.isNaN(Date.parse(publishedAt))
      ? publishedAt
      : input.acquiredAt;

  return {
    id: `bocha-candidate-${input.lineId}-${input.candidate.id}`,
    scope: { kind: "asset", line_id: input.lineId, symbol: input.symbol },
    metric_or_event_type: "candidate_event",
    value: null,
    source: {
      name: input.candidate.siteName ?? "Bocha candidate source",
      locator: input.candidate.url,
    },
    observation_or_event_time: observationTime,
    fetched_at: input.acquiredAt,
    status: "unverified",
    limitations: [
      "Bocha title and publication metadata are discovery hints only.",
      "The primary source must be read and independently verified before this candidate can support a material conclusion.",
    ],
    provenance: "observed",
  };
}

export function verifiedEventEvidence(input: {
  lineId: string;
  symbol: string;
  candidate: BochaCandidate;
  acquiredAt: string;
  excerpt: string;
  sourceTier: "official" | "trusted_media";
}): EvidenceRecord {
  const publishedAt = input.candidate.publishedAt;
  return {
    id: `verified-event-${input.lineId}-${input.candidate.id}`,
    scope: { kind: "asset", line_id: input.lineId, symbol: input.symbol },
    metric_or_event_type: "verified_event",
    value: input.excerpt,
    source: {
      name: input.candidate.siteName ?? (input.sourceTier === "official" ? "Official source" : "Trusted media"),
      locator: input.candidate.url,
    },
    observation_or_event_time: publishedAt && !Number.isNaN(Date.parse(publishedAt))
      ? publishedAt
      : input.acquiredAt,
    fetched_at: input.acquiredAt,
    status: "available",
    limitations: input.sourceTier === "trusted_media"
      ? ["This event was verified against an allowlisted trusted-media page, not an official primary source."]
      : [],
    provenance: "observed",
  };
}
