import { describe, expect, it } from "vitest";
import { MemoryMetricsStore, MetricsService, shanghaiDateKey } from "../../src/metrics/index.js";

describe("daily exhibition metrics", () => {
  it("counts one anonymous browser once per Shanghai day", async () => {
    let now = new Date("2026-07-26T01:00:00.000Z");
    const service = new MetricsService(new MemoryMetricsStore(), () => now);

    const first = await service.recordVisit(undefined);
    const repeat = await service.recordVisit(first.cookie);
    expect(first.snapshot.visits).toBe(1);
    expect(repeat.snapshot.visits).toBe(1);

    now = new Date("2026-07-26T16:00:00.000Z");
    const nextDay = await service.recordVisit(first.cookie);
    expect(nextDay.snapshot.date).toBe("2026-07-27");
    expect(nextDay.snapshot.visits).toBe(1);
  });

  it("combines workspace creation and newly accepted review starts", async () => {
    const service = new MetricsService(new MemoryMetricsStore(), () => new Date("2026-07-26T01:00:00.000Z"));
    await service.increment("workspace_creations");
    await service.increment("review_starts");
    await service.increment("review_starts");

    expect(await service.today()).toMatchObject({
      date: "2026-07-26",
      workspace_creations: 1,
      review_starts: 2,
      service_uses: 3,
      visits: 0,
    });
  });

  it("uses the requested timezone for the date key", () => {
    expect(shanghaiDateKey(new Date("2026-07-26T15:59:59.000Z"))).toBe("2026-07-26");
    expect(shanghaiDateKey(new Date("2026-07-26T16:00:00.000Z"))).toBe("2026-07-27");
  });
});
