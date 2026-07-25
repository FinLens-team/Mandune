import { describe, expect, it } from "vitest";
import {
  INSTRUMENT_DICTIONARY,
  INSTRUMENT_SUGGESTION_LIMIT,
  isInstrumentAssetClass,
  searchInstruments,
} from "../../src/instruments/index.js";

describe("instrument dictionary", () => {
  it("keeps entries unique by symbol with valid asset classes", () => {
    const symbols = new Set(INSTRUMENT_DICTIONARY.map((entry) => entry.symbol));
    expect(symbols.size).toBe(INSTRUMENT_DICTIONARY.length);
    for (const entry of INSTRUMENT_DICTIONARY) {
      expect(isInstrumentAssetClass(entry.asset_class)).toBe(true);
      expect(entry.symbol).toMatch(/^\d{6}\.(SH|SZ|OF)$/);
      expect(entry.pinyin_initials).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe("searchInstruments", () => {
  it("matches an exact bare code and the full symbol first", () => {
    expect(searchInstruments("510300")[0]?.symbol).toBe("510300.SH");
    expect(searchInstruments("510300.SH")[0]?.symbol).toBe("510300.SH");
    expect(searchInstruments("510300.sh")[0]?.symbol).toBe("510300.SH");
  });

  it("ranks exact code above code prefix", () => {
    // Both the fund and the A-share share the bare code; tie is broken
    // deterministically by symbol order.
    expect(searchInstruments("000001").map((item) => item.symbol)).toEqual([
      "000001.OF",
      "000001.SZ",
    ]);
    const prefixed = searchInstruments("5103");
    expect(prefixed[0]?.symbol).toBe("510300.SH");
  });

  it("matches by name prefix and substring", () => {
    expect(searchInstruments("沪深300")[0]?.symbol).toBe("510300.SH");
    expect(searchInstruments("茅台")[0]?.name).toBe("贵州茅台");
    const substring = searchInstruments("银行");
    expect(substring.length).toBeGreaterThan(0);
    expect(substring.every((item) => item.name.includes("银行"))).toBe(true);
  });

  it("matches pinyin initials as the lowest tier", () => {
    expect(searchInstruments("gzmt")[0]?.name).toBe("贵州茅台");
    expect(searchInstruments("hs300")[0]?.symbol).toBe("510300.SH");
    expect(searchInstruments("NDSD")[0]?.name).toBe("宁德时代");
  });

  it("normalizes full-width characters and internal whitespace", () => {
    expect(searchInstruments("５１０３００")[0]?.symbol).toBe("510300.SH");
    expect(searchInstruments(" 510300 　")[0]?.symbol).toBe("510300.SH");
  });

  it("filters by asset class without changing ranking rules", () => {
    const funds = searchInstruments("000001", { assetClass: "fund" });
    expect(funds.map((item) => item.symbol)).toEqual(["000001.OF"]);
    const etfOnly = searchInstruments("etf", { assetClass: "etf" });
    expect(etfOnly.every((item) => item.asset_class === "etf")).toBe(true);
  });

  it("caps results at the suggestion limit and stays deterministic", () => {
    const first = searchInstruments("5");
    const second = searchInstruments("5");
    expect(first.length).toBeLessThanOrEqual(INSTRUMENT_SUGGESTION_LIMIT);
    expect(first).toEqual(second);
  });

  it("returns nothing for empty, whitespace, oversized, or unmatched queries", () => {
    expect(searchInstruments("")).toEqual([]);
    expect(searchInstruments("   ")).toEqual([]);
    expect(searchInstruments("x".repeat(33))).toEqual([]);
    expect(searchInstruments("不存在的标的名称")).toEqual([]);
  });

  it("returns suggestions without pinyin internals and with venue markets only", () => {
    for (const suggestion of searchInstruments("银行")) {
      expect(Object.keys(suggestion).sort()).toEqual(
        suggestion.market !== undefined
          ? ["asset_class", "market", "name", "symbol"]
          : ["asset_class", "name", "symbol"],
      );
    }
    const fund = searchInstruments("110022")[0];
    expect(fund?.market).toBeUndefined();
  });
});
