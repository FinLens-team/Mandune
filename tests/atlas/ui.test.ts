import { readFileSync } from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AtlasCardV1 } from "../../src/atlas/index.js";
import type { AtlasGateway } from "../../src/app/client/gateway.js";

interface AtlasUiModule {
  AtlasCard: ComponentType<{
    card: AtlasCardV1;
    reducedMotion: boolean;
    onOpenDetail?: (cardId: string) => void;
  }>;
  AtlasReveal: ComponentType<{
    analysisId: string;
    gateway: AtlasGateway;
    onOpenAtlas: () => void;
  }>;
}

const ATLAS_UI_PATH = ["..", "..", "src", "features", "atlas", "index.js"].join("/");

async function loadAtlasUi(): Promise<AtlasUiModule> {
  return await import(ATLAS_UI_PATH) as AtlasUiModule;
}

function card(kind: "professional_term" | "meme", appearance: AtlasCardV1["appearance"]): AtlasCardV1 {
  return {
    schema_version: "atlas-card.v1",
    card_id: `card-${kind}`,
    kind,
    canonical_name: kind === "professional_term" ? "组合集中度" : "情绪先坐下",
    aliases: [],
    domain: kind === "professional_term" ? "portfolio" : null,
    scope_labels: ["示例组合"],
    appearance,
    visual_seed: "1234567890abcdef1234567890abcdef",
    generation_mode: "fixture",
    first_discovered_at: "2026-07-25T08:00:00.000Z",
    last_encountered_at: "2026-07-25T08:00:00.000Z",
    first_analysis_id: "analysis-ui",
    first_history_record_id: "analysis-ui",
    encounter_count: 1,
    professional: kind === "professional_term" ? {
      plain_explanation: "资金是否集中在少数持仓。",
      why_today: "今天的组合观察用到了它。",
      relation: "它解释组合对少数方向的敏感性。",
      misconception: "集中不等于一定亏损。",
      boundary: "不能预测未来涨跌。",
      reference_ids: ["ev-ui"],
    } : null,
    meme: kind === "meme" ? {
      meme_text: "数字还没说完，情绪先别抢麦。",
      plain_explanation: "先读完信息，再形成判断。",
      theme: "通用梗",
    } : null,
  };
}

describe("atlas accessible card UI", () => {
  it("renders explicit flip/detail controls, textual rarity, and a small readable AI marker", async () => {
    const { AtlasCard } = await loadAtlasUi();
    const markup = renderToStaticMarkup(createElement(AtlasCard, {
      card: card("professional_term", "collector"),
      reducedMotion: true,
      onOpenDetail: () => undefined,
    }));

    expect(markup).toContain('data-appearance="collector"');
    expect(markup).toContain('data-reduce-motion="true"');
    expect(markup).toContain("典藏");
    expect(markup).toContain("翻到背面");
    expect(markup).toContain("翻到正面");
    expect(markup).toContain("查看轨迹");
    expect(markup).toContain("AI 生成学习卡，仅用于辅助理解 · 示例");
    expect(markup).not.toMatch(/战力|收益率|投资价值/);
  });

  it("keeps the pending reveal skippable and defines lightweight encounter feedback", async () => {
    const { AtlasReveal } = await loadAtlasUi();
    const markup = renderToStaticMarkup(createElement(AtlasReveal, {
      analysisId: "analysis-ui",
      gateway: {
        getAtlasOutcome: async () => null,
        listAtlasCards: async () => [],
        getAtlasCard: async () => null,
        deleteAtlasCard: async () => undefined,
      },
      onOpenAtlas: () => undefined,
    }));
    expect(markup).toContain("图鉴正在辨识");
    expect(markup).toContain("跳过图鉴辨识");
    expect(markup).not.toContain("再次遇见");
    const source = readFileSync("src/features/atlas/AtlasReveal.tsx", "utf8");
    expect(source).toContain("再次遇见：");
    expect(source).toContain("成长轨迹已更新");
  });

  it("marks meme cards as generated entertainment rather than financial knowledge", async () => {
    const { AtlasCard } = await loadAtlasUi();
    const markup = renderToStaticMarkup(createElement(AtlasCard, {
      card: card("meme", "holographic"),
      reducedMotion: true,
    }));
    expect(markup).toContain("AI 生成趣味内容 · 非金融知识 · 示例");
  });

  it("defines responsive wall, reduced motion, and low-emphasis disclaimer styles", () => {
    const css = readFileSync("src/features/atlas/styles.css", "utf8");
    expect(css).toContain("repeat(auto-fit");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".atlas-card__disclaimer");
    expect(css).toContain("font-size: var(--font-size-xs)");
  });
});
