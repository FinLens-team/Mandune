import type { MetricsCounter, MetricsSnapshot, MetricsStore } from "../metrics/index.js";
import type { SqliteDatabase } from "./database.js";

interface MetricsRow {
  date: string;
  visits: number | bigint;
  workspace_creations: number | bigint;
  review_starts: number | bigint;
  updated_at: string | null;
}

function snapshot(row: MetricsRow): MetricsSnapshot {
  const workspaceCreations = Number(row.workspace_creations);
  const reviewStarts = Number(row.review_starts);
  return {
    date: row.date,
    visits: Number(row.visits),
    workspace_creations: workspaceCreations,
    review_starts: reviewStarts,
    service_uses: workspaceCreations + reviewStarts,
    updated_at: row.updated_at,
  };
}

export class SqliteMetricsStore implements MetricsStore {
  constructor(private readonly database: SqliteDatabase) {}

  async increment(date: string, counter: MetricsCounter, updatedAt: string): Promise<void> {
    const column = {
      visits: "visits",
      workspace_creations: "workspace_creations",
      review_starts: "review_starts",
    }[counter];
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO daily_metrics (date, ${column}, updated_at)
        VALUES (?, 1, ?)
        ON CONFLICT(date) DO UPDATE SET
          ${column} = daily_metrics.${column} + 1,
          updated_at = excluded.updated_at
      `).run(date, updatedAt);
    });
  }

  async get(date: string): Promise<MetricsSnapshot | null> {
    return this.database.read(() => {
      const row = this.database.prepare(`
        SELECT date, visits, workspace_creations, review_starts, updated_at
        FROM daily_metrics WHERE date = ?
      `).get(date) as MetricsRow | undefined;
      return row ? snapshot(row) : null;
    });
  }
}
