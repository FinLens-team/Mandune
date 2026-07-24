import type {
  HistoryReadResult,
  HistoryRecordV1,
  HistorySummary,
} from "../../history/index.js";

export interface HistoryReader {
  getDetail(workspaceId: string, recordId: string): Promise<HistoryReadResult>;
  list(workspaceId: string): Promise<HistorySummary[]>;
}

export interface HistoryListEntry {
  detail: HistoryReadResult;
  summary: HistorySummary;
}

export type HistoryEntriesResult =
  | { status: "loaded"; entries: HistoryListEntry[] }
  | { status: "unavailable" };

export type HistoryEvidenceBoundary = "cache" | "fixture" | "recorded";

export interface HistoryRecordBoundary {
  evidence: HistoryEvidenceBoundary;
  isExample: boolean;
}

export async function loadHistoryEntries(
  reader: HistoryReader,
  workspaceId: string,
): Promise<HistoryEntriesResult> {
  try {
    const summaries = await reader.list(workspaceId);
    const entries = await Promise.all(
      summaries.map(async (summary): Promise<HistoryListEntry> => {
        try {
          return {
            summary,
            detail: await reader.getDetail(workspaceId, summary.record_id),
          };
        } catch {
          return {
            summary,
            detail: { status: "unavailable", code: "storage_failure" },
          };
        }
      }),
    );
    return { status: "loaded", entries };
  } catch {
    return { status: "unavailable" };
  }
}

export function historyRecordBoundary(record: HistoryRecordV1): HistoryRecordBoundary {
  const sources = record.analysis.evidence.flatMap((item) => [
    item.source.name,
    item.source.locator,
  ]);
  const hasCacheSource = sources.some((value) => /cache|缓存/i.test(value));
  const hasFixtureSource = sources.some((value) => /fixture|示例证据/i.test(value));

  return {
    evidence: hasCacheSource ? "cache" : hasFixtureSource ? "fixture" : "recorded",
    isExample: record.snapshot.lines.some((line) => line.entry_method === "example"),
  };
}

export function formatHistoryDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}
