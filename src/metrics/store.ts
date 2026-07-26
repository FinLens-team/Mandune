import type { MetricsSnapshot, MetricsStore } from "./types.js";

export class MemoryMetricsStore implements MetricsStore {
  private readonly rows = new Map<string, MetricsSnapshot>();

  async increment(date: string, counter: keyof Omit<MetricsSnapshot, "date" | "updated_at" | "service_uses">, updatedAt: string): Promise<void> {
    const row = this.rows.get(date) ?? {
      date,
      visits: 0,
      workspace_creations: 0,
      review_starts: 0,
      service_uses: 0,
      updated_at: null,
    };
    row[counter] += 1;
    row.service_uses = row.workspace_creations + row.review_starts;
    row.updated_at = updatedAt;
    this.rows.set(date, row);
  }

  async get(date: string): Promise<MetricsSnapshot | null> {
    const row = this.rows.get(date);
    return row ? { ...row } : null;
  }
}
