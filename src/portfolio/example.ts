/**
 * Fictional example portfolio. Always labeled as example data.
 */

import type { PortfolioDraft } from "../contracts/index.js";
import { createId, nowIso } from "./ids.js";
import { withUsability } from "./usability.js";

export const EXAMPLE_SOURCE_LABEL = "示例数据";

export function createExampleDraft(): PortfolioDraft {
  const timestamp = nowIso();
  const tradingDay = "2026-07-23";
  return {
    draft_id: createId("draft"),
    created_at: timestamp,
    updated_at: timestamp,
    source_label: EXAMPLE_SOURCE_LABEL,
    constraints: {
      investment_horizon: "unknown",
      near_term_liquidity: "unknown",
      tolerable_drawdown: "unknown",
      investment_objective: "unknown",
    },
    lines: [
      withUsability({
        line_id: createId("line"),
        asset_class: "etf",
        name: "示例沪深300ETF",
        symbol: "510300.SH",
        market: "SH",
        size_basis: "示例持仓规模：中等",
        observation_date: tradingDay,
        entry_method: "example",
        notes: "示例数据，非真实持仓",
      }),
      withUsability({
        line_id: createId("line"),
        asset_class: "fund",
        name: "示例债券基金",
        symbol: "000001.OF",
        size_basis: "示例持仓规模：较小",
        observation_date: tradingDay,
        entry_method: "example",
        notes: "示例数据，非真实持仓",
      }),
      withUsability({
        line_id: createId("line"),
        asset_class: "a_share",
        name: "待确认示例股票",
        symbol: "unknown",
        market: "unknown",
        size_basis: "unknown",
        observation_date: "unknown",
        entry_method: "example",
        notes: "身份与规模未决，不能批量写入快照",
      }),
    ],
  };
}
