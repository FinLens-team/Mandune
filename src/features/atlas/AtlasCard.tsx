import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { BookOpen, RotateCcw, Route } from "lucide-react";
import type { AtlasCardV1 } from "../../atlas/index.js";
import { Button } from "../../client/ui/index.js";

const APPEARANCE_LABELS = {
  regular: "常规",
  holographic: "闪彩",
  collector: "典藏",
} as const;

const DOMAIN_LABELS = {
  risk: "风险",
  portfolio: "组合",
  valuation: "估值",
  liquidity: "流动性",
  market_behavior: "市场行为",
  market_cycle: "市场周期",
  company_or_product_event: "公司或产品事件",
  other: "其他金融知识",
} as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function seedStyle(seed: string): CSSProperties {
  const first = Number.parseInt(seed.slice(0, 4), 16);
  const second = Number.parseInt(seed.slice(4, 8), 16);
  const third = Number.parseInt(seed.slice(8, 12), 16);
  return {
    "--atlas-angle": `${first % 180}deg`,
    "--atlas-step": `${18 + (second % 19)}px`,
    "--atlas-offset": `${third % 31}%`,
  } as CSSProperties;
}

export interface AtlasCardProps {
  card: AtlasCardV1;
  reducedMotion: boolean;
  onOpenDetail?: (cardId: string) => void;
}

export function AtlasCard({ card, reducedMotion, onOpenDetail }: AtlasCardProps) {
  const [face, setFace] = useState<"front" | "back">("front");
  const frontHeading = useRef<HTMLHeadingElement>(null);
  const backHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    (face === "front" ? frontHeading : backHeading).current?.focus();
  }, [face]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setFace("back");
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setFace("front");
    }
  }

  return (
    <article
      aria-label={`${card.canonical_name}，${face === "front" ? "正面" : "背面"}`}
      className="atlas-card"
      data-appearance={card.appearance}
      data-face={face}
      data-kind={card.kind}
      data-reduce-motion={reducedMotion || undefined}
      onKeyDown={handleKeyDown}
      style={seedStyle(card.visual_seed)}
    >
      <div className="atlas-card__pattern" aria-hidden="true"><span /></div>
      <div className="atlas-card__inner">
        <section aria-hidden={face !== "front"} className="atlas-card__face atlas-card__front" inert={face !== "front" ? true : undefined}>
          <header className="atlas-card__meta">
            <span>{card.kind === "professional_term" ? "专业名词" : "趣味梗"}</span>
            <span>{APPEARANCE_LABELS[card.appearance]}</span>
          </header>
          <div className="atlas-card__title-block">
            <p>{card.domain ? DOMAIN_LABELS[card.domain] : card.meme?.theme}</p>
            <h2 ref={frontHeading} tabIndex={-1}>{card.canonical_name}</h2>
            {card.kind === "meme" ? <blockquote>{card.meme?.meme_text}</blockquote> : null}
          </div>
          <dl className="atlas-card__facts">
            <div><dt>首次发现</dt><dd>{formatDate(card.first_discovered_at)}</dd></div>
            <div><dt>累计遇见</dt><dd>{card.encounter_count} 次</dd></div>
          </dl>
          <div className="atlas-card__actions">
            <Button onClick={() => setFace("back")} variant="secondary">
              <BookOpen aria-hidden="true" size={18} />
              翻到背面
            </Button>
            {onOpenDetail ? (
              <Button onClick={() => onOpenDetail(card.card_id)} variant="secondary">
                <Route aria-hidden="true" size={18} />
                查看轨迹
              </Button>
            ) : null}
          </div>
        </section>

        <section aria-hidden={face !== "back"} className="atlas-card__face atlas-card__back" inert={face !== "back" ? true : undefined}>
          <header className="atlas-card__meta">
            <span>背面</span>
            <span>{APPEARANCE_LABELS[card.appearance]}</span>
          </header>
          <div className="atlas-card__knowledge">
            <h2 ref={backHeading} tabIndex={-1}>{card.canonical_name}</h2>
            {card.professional ? (
              <>
                <section><h3>白话解释</h3><p>{card.professional.plain_explanation}</p></section>
                <section><h3>今天为什么遇见</h3><p>{card.professional.why_today}</p></section>
                <section><h3>与本次复盘的关系</h3><p>{card.professional.relation}</p></section>
                <section><h3>常见误解</h3><p>{card.professional.misconception}</p></section>
                <section><h3>理解边界</h3><p>{card.professional.boundary}</p></section>
              </>
            ) : (
              <>
                <blockquote>{card.meme?.meme_text}</blockquote>
                <p>{card.meme?.plain_explanation}</p>
              </>
            )}
          </div>
          <p className="atlas-card__disclaimer">
            {card.kind === "professional_term"
              ? `AI 生成学习卡，仅用于辅助理解${card.generation_mode === "fixture" ? " · 示例" : ""}`
              : `AI 生成趣味内容 · 非金融知识${card.generation_mode === "fixture" ? " · 示例" : ""}`}
          </p>
          <div className="atlas-card__actions">
            <Button onClick={() => setFace("front")} variant="secondary">
              <RotateCcw aria-hidden="true" size={18} />
              翻到正面
            </Button>
            {onOpenDetail ? (
              <Button onClick={() => onOpenDetail(card.card_id)} variant="secondary">
                <Route aria-hidden="true" size={18} />
                查看轨迹
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </article>
  );
}
