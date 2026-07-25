import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { AtlasCardDetail, AtlasOutcomeCard } from "../../atlas/index.js";
import type { AtlasGateway } from "../../app/client/gateway.js";
import { themeCssVariables } from "../../theme/client.js";

const CLOSE_SWIPE_PX = 72;

export interface AtlasRevealProps {
  analysisId: string;
  gateway: AtlasGateway;
  reducedMotion: boolean;
  themeId: string;
}

interface RevealedCard {
  detail: AtlasCardDetail;
  disposition: AtlasOutcomeCard["disposition"];
  encounterText: string;
}

function cardSummary(item: RevealedCard): string {
  return item.encounterText || (item.detail.card.kind === "professional_term"
    ? item.detail.card.professional?.plain_explanation ?? ""
    : item.detail.card.meme?.meme_text ?? "");
}

function AtlasRevealDetail({
  item,
  closing,
  onClose,
  onClosed,
  reducedMotion,
}: {
  item: RevealedCard;
  closing: boolean;
  onClose: () => void;
  onClosed: () => void;
  reducedMotion: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointerStart = useRef<number | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    if (!closing) return;
    const fallback = window.setTimeout(onClosed, 280);
    return () => window.clearTimeout(fallback);
  }, [closing, onClosed]);

  function pointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse") pointerStart.current = event.clientY;
  }

  function pointerUp(event: PointerEvent<HTMLElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (start !== null && event.clientY - start >= CLOSE_SWIPE_PX) onClose();
  }

  const { card } = item.detail;
  return (
    <dialog
      aria-labelledby="atlas-reveal-detail-heading"
      className="atlas-reveal-dialog"
      data-closing={closing || undefined}
      data-reduce-motion={reducedMotion || undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      ref={dialogRef}
    >
      <article
        className="atlas-reveal-dialog__sheet"
        onAnimationEnd={(event) => {
          if (closing && event.target === event.currentTarget) onClosed();
        }}
        onPointerDown={pointerDown}
        onPointerUp={pointerUp}
      >
        <div aria-hidden="true" className="atlas-reveal-dialog__handle" />
        <header
          aria-label={`收起${card.canonical_name}详情`}
          onClick={onClose}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onClose();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <p>{item.disposition === "new_card" ? "本次获得" : "再次遇见"} · {card.kind === "professional_term" ? "专业概念" : "场景梗"}</p>
          <h2 id="atlas-reveal-detail-heading">{card.canonical_name}</h2>
          <p>{item.encounterText}</p>
        </header>
        {card.professional ? (
          <div className="atlas-reveal-dialog__content">
            <section><h3>白话解释</h3><p>{card.professional.plain_explanation}</p></section>
            <section><h3>今天为什么遇见</h3><p>{item.encounterText || card.professional.why_today}</p></section>
            <section><h3>与本次复盘的关系</h3><p>{card.professional.relation}</p></section>
            <section><h3>常见误解</h3><p>{card.professional.misconception}</p></section>
            <section><h3>理解边界</h3><p>{card.professional.boundary}</p></section>
          </div>
        ) : (
          <div className="atlas-reveal-dialog__content">
            <blockquote>{card.meme?.meme_text}</blockquote>
            <section><h3>这个梗在说什么</h3><p>{card.meme?.plain_explanation}</p></section>
          </div>
        )}
      </article>
    </dialog>
  );
}

export function AtlasReveal({ analysisId, gateway, reducedMotion, themeId }: AtlasRevealProps) {
  const [cards, setCards] = useState<RevealedCard[] | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const outcome = await gateway.getAtlasOutcome(analysisId);
        if (ignore) return;
        if (!outcome || outcome.status === "pending") {
          timer = setTimeout(() => void poll(), 750);
          return;
        }
        const outcomeCards = outcome.cards ?? (outcome.card_id &&
          (outcome.status === "new_card" || outcome.status === "encountered")
          ? [{ card_id: outcome.card_id, disposition: outcome.status }]
          : []);
        const details = await Promise.all(outcomeCards.slice(0, 4).map(async (item) => {
          const detail = await gateway.getAtlasCard(item.card_id);
          if (!detail) return null;
          const encounter = detail.encounters.find((candidate) => candidate.analysis_id === analysisId);
          return {
            detail,
            disposition: item.disposition,
            encounterText: encounter?.context_summary ?? "",
          } satisfies RevealedCard;
        }));
        if (!ignore) setCards(details.filter((item): item is RevealedCard => item !== null));
      } catch {
        if (!ignore) setCards([]);
      }
    }
    void poll();
    return () => { ignore = true; if (timer) clearTimeout(timer); };
  }, [analysisId, gateway]);

  if (!cards?.length) return null;
  const selected = cards.find((item) => item.detail.card.card_id === selectedCardId);
  function closeDetail() {
    if (reducedMotion) {
      setSelectedCardId(null);
      setClosing(false);
      return;
    }
    setClosing(true);
  }
  return (
    <aside
      aria-label="本次图鉴收获"
      className="atlas-reveal"
      data-reduce-motion={reducedMotion || undefined}
      style={themeCssVariables(themeId)}
    >
      <p className="atlas-reveal__eyebrow">本次图鉴</p>
      <div className="atlas-reveal__list">
        {cards.map((item, index) => {
          const card = item.detail.card;
          const active = selectedCardId === card.card_id;
          return (
            <button
              aria-expanded={active}
              className="atlas-reveal__banner"
              key={card.card_id}
              onClick={() => {
                if (active) closeDetail();
                else {
                  setClosing(false);
                  setSelectedCardId(card.card_id);
                }
              }}
              style={{ "--atlas-reveal-index": index } as CSSProperties}
              type="button"
            >
              <span className="atlas-reveal__copy">
                <strong>{card.canonical_name}</strong>
                <span>{cardSummary(item)}</span>
              </span>
              <span className="atlas-reveal__status">{item.disposition === "new_card" ? "新" : "复遇"}</span>
              <ChevronRight aria-hidden="true" size={20} />
            </button>
          );
        })}
      </div>
      {selected ? (
        <AtlasRevealDetail
          item={selected}
          closing={closing}
          onClose={closeDetail}
          onClosed={() => {
            setSelectedCardId(null);
            setClosing(false);
          }}
          reducedMotion={reducedMotion}
        />
      ) : null}
    </aside>
  );
}
