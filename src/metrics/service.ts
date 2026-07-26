import { randomBytes } from "node:crypto";
import { MemoryMetricsStore } from "./store.js";
import type { MetricsCounter, MetricsSnapshot, MetricsStore } from "./types.js";

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

function dateKeyParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SHANGHAI_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function shanghaiDateKey(date: Date = new Date()): string {
  const parts = dateKeyParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function emptySnapshot(date: string): MetricsSnapshot {
  return {
    date,
    visits: 0,
    workspace_creations: 0,
    review_starts: 0,
    service_uses: 0,
    updated_at: null,
  };
}

function visitorCookieValue(date: string): string {
  return `${date}.${randomBytes(24).toString("base64url")}`;
}

export class MetricsService {
  constructor(
    private readonly store: MetricsStore = new MemoryMetricsStore(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async increment(counter: MetricsCounter): Promise<MetricsSnapshot> {
    const date = shanghaiDateKey(this.now());
    await this.store.increment(date, counter, this.now().toISOString());
    return this.today();
  }

  async recordVisit(visitorCookie: string | undefined): Promise<{
    snapshot: MetricsSnapshot;
    cookie?: string;
  }> {
    const date = shanghaiDateKey(this.now());
    if (visitorCookie?.startsWith(`${date}.`)) {
      return { snapshot: await this.today() };
    }
    await this.store.increment(date, "visits", this.now().toISOString());
    return {
      snapshot: await this.today(),
      cookie: visitorCookieValue(date),
    };
  }

  async today(): Promise<MetricsSnapshot> {
    const date = shanghaiDateKey(this.now());
    return (await this.store.get(date)) ?? emptySnapshot(date);
  }
}
