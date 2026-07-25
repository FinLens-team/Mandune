import type { InstrumentEntry } from "./types.js";

/**
 * Built-in static reference dictionary (partial coverage seed).
 * Only stable public identity facts: code, name, asset class, venue.
 * It is a fill-in aid — NOT market data, NOT provider cache, NOT a
 * coverage claim. Unmatched input must stay free text / unknown.
 */
export const INSTRUMENT_DICTIONARY_AS_OF = "2026-07-25";
export const INSTRUMENT_DICTIONARY_SOURCE_LABEL =
  "内置静态参考字典（部分覆盖，仅用于填表辅助，非行情证据）";

export const INSTRUMENT_DICTIONARY: readonly InstrumentEntry[] = [
  // --- ETF ---
  { symbol: "510300.SH", name: "沪深300ETF", pinyin_initials: "hs300etf", asset_class: "etf", market: "SH" },
  { symbol: "510050.SH", name: "上证50ETF", pinyin_initials: "sz50etf", asset_class: "etf", market: "SH" },
  { symbol: "510500.SH", name: "中证500ETF", pinyin_initials: "zz500etf", asset_class: "etf", market: "SH" },
  { symbol: "588000.SH", name: "科创50ETF", pinyin_initials: "kc50etf", asset_class: "etf", market: "SH" },
  { symbol: "512880.SH", name: "证券ETF", pinyin_initials: "zqetf", asset_class: "etf", market: "SH" },
  { symbol: "518880.SH", name: "黄金ETF", pinyin_initials: "hjetf", asset_class: "etf", market: "SH" },
  { symbol: "513050.SH", name: "中概互联网ETF", pinyin_initials: "zghlwetf", asset_class: "etf", market: "SH" },
  { symbol: "512170.SH", name: "医疗ETF", pinyin_initials: "yletf", asset_class: "etf", market: "SH" },
  { symbol: "510880.SH", name: "红利ETF", pinyin_initials: "hletf", asset_class: "etf", market: "SH" },
  { symbol: "511010.SH", name: "国债ETF", pinyin_initials: "gzetf", asset_class: "etf", market: "SH" },
  { symbol: "515030.SH", name: "新能源车ETF", pinyin_initials: "xnycetf", asset_class: "etf", market: "SH" },
  { symbol: "159915.SZ", name: "创业板ETF", pinyin_initials: "cybetf", asset_class: "etf", market: "SZ" },
  { symbol: "159920.SZ", name: "恒生ETF", pinyin_initials: "hsetf", asset_class: "etf", market: "SZ" },
  { symbol: "159949.SZ", name: "创业板50ETF", pinyin_initials: "cyb50etf", asset_class: "etf", market: "SZ" },
  // --- A 股 ---
  { symbol: "600519.SH", name: "贵州茅台", pinyin_initials: "gzmt", asset_class: "a_share", market: "SH" },
  { symbol: "601318.SH", name: "中国平安", pinyin_initials: "zgpa", asset_class: "a_share", market: "SH" },
  { symbol: "600036.SH", name: "招商银行", pinyin_initials: "zsyh", asset_class: "a_share", market: "SH" },
  { symbol: "601398.SH", name: "工商银行", pinyin_initials: "gsyh", asset_class: "a_share", market: "SH" },
  { symbol: "601988.SH", name: "中国银行", pinyin_initials: "zgyh", asset_class: "a_share", market: "SH" },
  { symbol: "600900.SH", name: "长江电力", pinyin_initials: "cjdl", asset_class: "a_share", market: "SH" },
  { symbol: "600028.SH", name: "中国石化", pinyin_initials: "zgsh", asset_class: "a_share", market: "SH" },
  { symbol: "601857.SH", name: "中国石油", pinyin_initials: "zgsy", asset_class: "a_share", market: "SH" },
  { symbol: "600030.SH", name: "中信证券", pinyin_initials: "zxzq", asset_class: "a_share", market: "SH" },
  { symbol: "600276.SH", name: "恒瑞医药", pinyin_initials: "hryy", asset_class: "a_share", market: "SH" },
  { symbol: "601888.SH", name: "中国中免", pinyin_initials: "zgzm", asset_class: "a_share", market: "SH" },
  { symbol: "603288.SH", name: "海天味业", pinyin_initials: "htwy", asset_class: "a_share", market: "SH" },
  { symbol: "600887.SH", name: "伊利股份", pinyin_initials: "ylgf", asset_class: "a_share", market: "SH" },
  { symbol: "601012.SH", name: "隆基绿能", pinyin_initials: "ljln", asset_class: "a_share", market: "SH" },
  { symbol: "000001.SZ", name: "平安银行", pinyin_initials: "payh", asset_class: "a_share", market: "SZ" },
  { symbol: "000002.SZ", name: "万科A", pinyin_initials: "wka", asset_class: "a_share", market: "SZ" },
  { symbol: "000333.SZ", name: "美的集团", pinyin_initials: "mdjt", asset_class: "a_share", market: "SZ" },
  { symbol: "000651.SZ", name: "格力电器", pinyin_initials: "gldq", asset_class: "a_share", market: "SZ" },
  { symbol: "000858.SZ", name: "五粮液", pinyin_initials: "wly", asset_class: "a_share", market: "SZ" },
  { symbol: "002594.SZ", name: "比亚迪", pinyin_initials: "byd", asset_class: "a_share", market: "SZ" },
  { symbol: "002415.SZ", name: "海康威视", pinyin_initials: "hkws", asset_class: "a_share", market: "SZ" },
  { symbol: "300750.SZ", name: "宁德时代", pinyin_initials: "ndsd", asset_class: "a_share", market: "SZ" },
  { symbol: "300059.SZ", name: "东方财富", pinyin_initials: "dfcf", asset_class: "a_share", market: "SZ" },
  { symbol: "002714.SZ", name: "牧原股份", pinyin_initials: "mygf", asset_class: "a_share", market: "SZ" },
  // --- 场外基金 ---
  { symbol: "000001.OF", name: "华夏成长混合", pinyin_initials: "hxczhh", asset_class: "fund" },
  { symbol: "110022.OF", name: "易方达消费行业股票", pinyin_initials: "yfdxfhygp", asset_class: "fund" },
  { symbol: "161725.OF", name: "招商中证白酒指数", pinyin_initials: "zszzbjzs", asset_class: "fund" },
  { symbol: "005827.OF", name: "易方达蓝筹精选混合", pinyin_initials: "yfdlcjxhh", asset_class: "fund" },
  { symbol: "260108.OF", name: "景顺长城新兴成长混合", pinyin_initials: "jsccxxczhh", asset_class: "fund" },
  { symbol: "163406.OF", name: "兴全合润混合", pinyin_initials: "xqhrhh", asset_class: "fund" },
  { symbol: "519674.OF", name: "银河创新成长混合", pinyin_initials: "yhcxczhh", asset_class: "fund" },
];
