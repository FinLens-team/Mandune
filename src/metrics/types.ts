export interface MetricsSnapshot {
  date: string;
  visits: number;
  workspace_creations: number;
  review_starts: number;
  service_uses: number;
  updated_at: string | null;
}

export type MetricsCounter = "visits" | "workspace_creations" | "review_starts";

export interface MetricsStore {
  increment(date: string, counter: MetricsCounter, updatedAt: string): Promise<void>;
  get(date: string): Promise<MetricsSnapshot | null>;
}
