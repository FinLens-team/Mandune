import type { EvidenceRecord } from "../contracts/index.js";

const MARKET_METRICS = new Set(["close", "nav"]);
const MONTH_MIN_SESSIONS = 15;
const MONTH_MAX_SESSIONS = 22;
const YEAR_MIN_SESSIONS = 200;
const YEAR_MAX_SESSIONS = 252;

interface MarketPoint {
  id: string;
  date: string;
  value: number;
}

export interface MarketWindowSummary {
  label: "近3个交易日" | "近1个月" | "近1年";
  status: "available" | "insufficient";
  sample_count: number;
  start_date?: string;
  end_date?: string;
  return_pct?: number;
  high?: number;
  low?: number;
  max_drawdown_pct?: number;
  evidence_refs: string[];
  limitation?: string;
}

export interface AssetMarketContext {
  line_id: string;
  symbol?: string;
  metric: "close" | "nav";
  source: string;
  unit?: string;
  recent_observations: Array<{ date: string; value: number; evidence_id: string }>;
  windows: MarketWindowSummary[];
}

export interface ModelMarketContext {
  schema_version: "model-market-context.v1";
  assets: AssetMarketContext[];
  important_events: Array<{
    id: string;
    line_id?: string;
    event_time: string;
    summary: string;
    source_name: string;
    source_locator: string;
  }>;
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

function validDate(value: string): string | undefined {
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function summarize(
  label: MarketWindowSummary["label"],
  all: readonly MarketPoint[],
  minimum: number,
  maximum: number,
): MarketWindowSummary {
  const points = all.slice(-maximum);
  if (points.length < minimum) {
    return {
      label,
      status: "insufficient",
      sample_count: points.length,
      evidence_refs: points.length > 0 ? [points[0]!.id, points.at(-1)!.id] : [],
      limitation: `仅有 ${points.length} 个有效交易日，未达到 ${minimum} 个交易日的最低摘要门槛。`,
    };
  }
  const first = points[0]!;
  const latest = points.at(-1)!;
  let peak = first.value;
  let maxDrawdown = 0;
  for (const point of points) {
    peak = Math.max(peak, point.value);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (point.value - peak) / peak);
  }
  const highPoint = points.reduce((best, point) => point.value > best.value ? point : best);
  const lowPoint = points.reduce((best, point) => point.value < best.value ? point : best);
  return {
    label,
    status: "available",
    sample_count: points.length,
    start_date: first.date,
    end_date: latest.date,
    return_pct: rounded(((latest.value - first.value) / Math.abs(first.value)) * 100),
    high: highPoint.value,
    low: lowPoint.value,
    max_drawdown_pct: rounded(maxDrawdown * 100),
    evidence_refs: [...new Set([first.id, latest.id, highPoint.id, lowPoint.id])],
  };
}

function seriesFromEvidence(evidence: readonly EvidenceRecord[]): AssetMarketContext[] {
  const groups = new Map<string, { rows: MarketPoint[]; item: EvidenceRecord }>();
  for (const item of evidence) {
    const eligible = item.status === "available" ||
      (item.status === "ambiguous" && item.normalization_note === "unitless_return_eligible:same_provider_method");
    if (item.scope.kind !== "asset" || !MARKET_METRICS.has(item.metric_or_event_type) ||
      !eligible || typeof item.value !== "number" || !Number.isFinite(item.value)) continue;
    const date = validDate(item.observation_or_event_time);
    if (!date) continue;
    const key = `${item.scope.line_id}\u0000${item.metric_or_event_type}\u0000${item.source.name}`;
    const group = groups.get(key) ?? { rows: [], item };
    group.rows.push({ id: item.id, date, value: item.value });
    groups.set(key, group);
  }

  const bestByLine = new Map<string, { rows: MarketPoint[]; item: EvidenceRecord }>();
  for (const group of groups.values()) {
    const rows = [...new Map(group.rows.map((row) => [row.date, row])).values()]
      .sort((left, right) => left.date.localeCompare(right.date));
    const lineId = group.item.scope.kind === "asset" ? group.item.scope.line_id : "";
    const current = bestByLine.get(lineId);
    if (!current || rows.length > current.rows.length ||
      (rows.length === current.rows.length && (rows.at(-1)?.date ?? "") > (current.rows.at(-1)?.date ?? ""))) {
      bestByLine.set(lineId, { rows, item: group.item });
    }
  }

  return [...bestByLine.entries()].map(([lineId, { rows, item }]) => ({
    line_id: lineId,
    ...(item.scope.kind === "asset" && item.scope.symbol ? { symbol: item.scope.symbol } : {}),
    metric: item.metric_or_event_type as "close" | "nav",
    source: item.source.name,
    ...(item.unit ? { unit: item.unit } : {}),
    recent_observations: rows.slice(-3).map((row) => ({
      date: row.date,
      value: row.value,
      evidence_id: row.id,
    })),
    windows: [
      summarize("近3个交易日", rows, 3, 3),
      summarize("近1个月", rows, MONTH_MIN_SESSIONS, MONTH_MAX_SESSIONS),
      summarize("近1年", rows, YEAR_MIN_SESSIONS, YEAR_MAX_SESSIONS),
    ],
  })).sort((left, right) => left.line_id.localeCompare(right.line_id));
}

export function compileModelMarketContext(evidence: readonly EvidenceRecord[]): ModelMarketContext {
  return {
    schema_version: "model-market-context.v1",
    assets: seriesFromEvidence(evidence),
    important_events: evidence
      .filter((item) => item.metric_or_event_type === "verified_event" && item.status === "available")
      .map((item) => ({
        id: item.id,
        ...(item.scope.kind === "asset" ? { line_id: item.scope.line_id } : {}),
        event_time: item.observation_or_event_time,
        summary: typeof item.value === "string" ? item.value : "已核验重要事件",
        source_name: item.source.name,
        source_locator: item.source.locator,
      }))
      .sort((left, right) => right.event_time.localeCompare(left.event_time)),
  };
}
