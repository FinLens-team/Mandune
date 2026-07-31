import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AkshareMarketEvidenceSource, FallbackMarketEvidenceSource } from "../../src/providers/index.js";
import type { MarketEvidenceSource } from "../../src/analysis/index.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function worker(source: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "mandune-akshare-test-"));
  roots.push(root);
  const target = path.join(root, "worker.js");
  writeFileSync(target, source);
  return target;
}

const request = {
  lineId: "line-1",
  assetClass: "a_share" as const,
  symbol: "600519.SH",
  acquiredAt: "2026-07-31T12:00:00.000Z",
  latestCompleteTradingDay: "2026-07-31",
  signal: new AbortController().signal,
};

describe("AKShare market evidence", () => {
  it("normalizes a bounded three-day worker result", async () => {
    const source = new AkshareMarketEvidenceSource({
      pythonExecutable: process.execPath,
      workerPath: worker(`process.stdin.resume(); process.stdin.on('end', () => console.log(JSON.stringify({status:'completed',results:[{lineId:'line-1',assetClass:'a_share',symbol:'600519.SH',status:'available',method:'stock_zh_a_hist',rows:[{date:'2026-07-29',close:1410},{date:'2026-07-30',close:1420},{date:'2026-07-31',close:1430}]}]})));`),
    });
    const evidence = await source.collectMarketEvidence(request);
    expect(evidence).toHaveLength(3);
    expect(evidence.at(-1)).toMatchObject({ value: 1430, unit: "CNY", status: "available" });
    expect(evidence.every((item) => item.source.name === "AKShare")).toBe(true);
  });

  it("normalizes off-exchange fund history as unit NAV evidence", async () => {
    const source = new AkshareMarketEvidenceSource({
      pythonExecutable: process.execPath,
      workerPath: worker(`process.stdin.resume(); process.stdin.on('end', () => console.log(JSON.stringify({status:'completed',results:[{lineId:'line-fund',assetClass:'fund',symbol:'000001.OF',status:'available',method:'fund_open_fund_info_em',rows:[{date:'2026-07-28',close:1.302},{date:'2026-07-29',close:1.304},{date:'2026-07-30',close:1.221}]}]})));`),
    });
    const evidence = await source.collectMarketEvidence({
      ...request,
      lineId: "line-fund",
      assetClass: "fund",
      symbol: "000001.OF",
      latestCompleteTradingDay: "2026-07-30",
    });

    expect(evidence).toHaveLength(3);
    expect(evidence.map((item) => item.metric_or_event_type)).toEqual(["nav", "nav", "nav"]);
    expect(evidence.at(-1)).toMatchObject({ value: 1.221, unit: "CNY_per_share", status: "available" });
    expect(evidence.at(-1)?.source.locator).toContain("fund_open_fund_info_em");
  });

  it("fails closed on malformed worker output", async () => {
    const source = new AkshareMarketEvidenceSource({
      pythonExecutable: process.execPath,
      workerPath: worker("console.log('not-json')"),
    });
    const evidence = await source.collectMarketEvidence(request);
    expect(evidence).toMatchObject([{ status: "failed", value: null }]);
  });

  it("uses the fallback only when AKShare lacks a usable three-day series", async () => {
    const failed: MarketEvidenceSource = { collectMarketEvidence: async () => [{
      id: "ak-failed", scope: { kind: "asset", line_id: "line-1", symbol: "600519.SH" },
      metric_or_event_type: "close", value: null, source: { name: "AKShare", locator: "akshare:test" },
      observation_or_event_time: "2026-07-31", fetched_at: request.acquiredAt, status: "failed",
      limitations: ["failed"], provenance: "observed",
    }] };
    const fallback: MarketEvidenceSource = { collectMarketEvidence: async () => [{
      id: "fallback", scope: { kind: "asset", line_id: "line-1", symbol: "600519.SH" },
      metric_or_event_type: "close", value: 1430, unit: "CNY", source: { name: "Tencent", locator: "tencent:test" },
      observation_or_event_time: "2026-07-31", fetched_at: request.acquiredAt, status: "available",
      limitations: [], provenance: "observed",
    }] };
    const evidence = await new FallbackMarketEvidenceSource(failed, fallback).collectMarketEvidence(request);
    expect(evidence.map((item) => item.source.name)).toEqual(["AKShare", "Tencent"]);
  });
});
