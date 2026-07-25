import {
  ArrowRight,
  ImageUp,
  LockKeyhole,
  PenLine,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, Ref } from "react";
import type { PersonalConstraints } from "../../contracts/index.js";
import type { DemoExperienceIdentity } from "../../demo-experience/index.js";
import { Button } from "../../client/ui/index.js";
import mandongLogo from "../../client/assets/mandong-logo.webp";
import themeCardOne from "../../client/assets/themes/theme-card-1.webp";
import themeCardTwo from "../../client/assets/themes/theme-card-2.webp";
import themeCardThree from "../../client/assets/themes/theme-card-3.webp";
import themeCardFour from "../../client/assets/themes/theme-card-4.webp";
import type { ThemeId } from "../../theme/index.js";

interface ScreenTitleProps {
  titleRef?: Ref<HTMLHeadingElement>;
}

export interface SplashScreenProps {
  returning?: boolean;
  leaving?: boolean;
}

export function SplashScreen({ returning = false, leaving = false }: SplashScreenProps) {
  const classes = [
    "onboarding-screen",
    "onboarding-splash",
    returning ? "onboarding-splash--returning" : "",
    leaving ? "onboarding-splash--leaving" : "",
  ].filter(Boolean).join(" ");
  return (
    <section className={classes} aria-labelledby="s0-title">
      <div className="onboarding-splash__copy">
        <img
          alt="满懂"
          className="onboarding-splash__logo"
          decoding="async"
          fetchPriority="high"
          height={317}
          src={mandongLogo}
          width={1200}
          id="s0-title"
        />
        <p className="onboarding-splash__positioning">数据有剧情，复盘不无聊</p>
      </div>
    </section>
  );
}

export interface ThemeSelectionScreenProps extends ScreenTitleProps {
  selectedThemeId: ThemeId;
  onSelect: (themeId: ThemeId) => void;
  onContinue: () => void;
}

const THEME_CARDS = [
  {
    available: false,
    description: "鸿运当头，把今天的变化看个明白",
    height: 622,
    image: themeCardOne,
    index: 1,
    name: "鸿运当头",
    width: 368,
  },
  {
    available: true,
    description: "我是奶龙！哈哈哈哈哈",
    height: 622,
    image: themeCardTwo,
    index: 2,
    name: "我是龙",
    themeId: "eastern_observation",
    width: 366,
  },
  {
    available: true,
    description: "吉星高照，和AI一起寻找值得留意的信号",
    height: 622,
    image: themeCardThree,
    index: 3,
    name: "吉星高照",
    themeId: "jixing_doudou",
    width: 364,
  },
  {
    available: true,
    description: "能和AI聊天就不要和人类聊天",
    height: 1244,
    image: themeCardFour,
    index: 4,
    name: "孙哥",
    themeId: "sunge",
    width: 730,
  },
] as const;

function themeCardMotion(index: number, focusedIndex: number | null): CSSProperties {
  const initialX = [-1.5, -0.5, 0.5, 1.5][index - 1] ?? 0;
  const initialRotation = [-10, -3.5, 3.5, 10][index - 1] ?? 0;
  let x = initialX;
  let y = 92 + Math.abs(initialX) * 8;
  let rotation = initialRotation;
  let scale = 1;
  let z = index === 2 ? 8 : index;

  if (focusedIndex !== null) {
    if (index === focusedIndex) {
      x = 0;
      y = -28;
      rotation = 0;
      scale = 1.08;
      z = 10;
    } else {
      const remainingCards = THEME_CARDS.filter((card) => card.index !== focusedIndex);
      const remainingPosition = remainingCards.findIndex((card) => card.index === index);
      const centeredPosition = remainingPosition - (remainingCards.length - 1) / 2;
      x = centeredPosition * 1.05;
      y = 126 + Math.abs(centeredPosition) * 8;
      rotation = centeredPosition * 7;
      scale = 0.82;
      z = 5 + remainingPosition;
    }
  }

  return {
    "--card-delay": `${70 + index * 65}ms`,
    "--card-r": `${rotation}deg`,
    "--card-scale": scale,
    "--card-x": `calc(${x} * var(--fan-unit))`,
    "--card-y": `${y}px`,
    "--card-z": z,
  } as CSSProperties;
}

export function ThemeSelectionScreen({
  selectedThemeId,
  titleRef,
  onSelect,
  onContinue,
}: ThemeSelectionScreenProps) {
  const focusedIndex = THEME_CARDS.find((theme) =>
    theme.available && theme.themeId === selectedThemeId
  )?.index ?? 2;
  const focusedTheme = THEME_CARDS.find((theme) => theme.index === focusedIndex) ?? null;

  return (
    <section className="onboarding-screen onboarding-theme-screen" aria-labelledby="s1-title">
      <header className="onboarding-heading">
        <p className="onboarding-step">首次引导 · 1 / 3</p>
        <h1 id="s1-title" ref={titleRef} tabIndex={-1}>
          选择你喜欢的主题~
        </h1>
      </header>

      <div className="onboarding-theme-stage" data-focused={focusedIndex ?? "none"}>
        <div aria-label="复盘主题" className="onboarding-theme-deck" role="group">
          {THEME_CARDS.map((theme) => (
            <button
              aria-label={theme.available ? `选择${theme.name}主题` : `查看${theme.name}主题预览，暂未开放`}
              aria-pressed={theme.available ? theme.themeId === selectedThemeId : undefined}
              className={`onboarding-theme-card ${theme.available ? "onboarding-theme-card--available" : "onboarding-theme-card--locked"}${focusedIndex === theme.index ? " is-focused" : ""}`}
              data-theme-index={theme.index}
              key={theme.index}
              onClick={theme.available ? () => onSelect(theme.themeId) : undefined}
              style={themeCardMotion(theme.index, focusedIndex)}
              type="button"
            >
              <span className="onboarding-theme-card__artwork">
                <img
                  alt=""
                  decoding="async"
                  fetchPriority={theme.available ? "high" : "low"}
                  height={theme.height}
                  src={theme.image}
                  width={theme.width}
                />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="onboarding-theme-detail" aria-live="polite" data-open={focusedTheme ? "true" : "false"}>
        {focusedTheme ? (
          <>
            <div>
              <span>{focusedTheme.available ? "当前主题" : "主题预览"}</span>
              <strong>{focusedTheme.name}</strong>
            </div>
            <p>{focusedTheme.description}</p>
            {!focusedTheme.available ? <span className="onboarding-theme-detail__lock">暂未开放</span> : null}
          </>
        ) : <p>点击一张卡片查看主题介绍</p>}
      </div>

      <footer className="onboarding-theme-footer">
        <Button onClick={onContinue} variant="primary">
          下一步 <ArrowRight aria-hidden="true" size={18} />
        </Button>
      </footer>
    </section>
  );
}

export interface SourceSelectionScreenProps extends ScreenTitleProps {
  placeholderMessage: string | null;
  onBack: () => void;
  onChooseRandom: () => void;
  onPlaceholder: (source: "manual" | "screenshot") => void;
}

export function SourceSelectionScreen({
  placeholderMessage,
  titleRef,
  onBack,
  onChooseRandom,
  onPlaceholder,
}: SourceSelectionScreenProps) {
  return (
    <section className="onboarding-screen onboarding-source" aria-labelledby="s2-title">
      <header className="onboarding-heading">
        <p className="onboarding-step">首次引导 · 2 / 3</p>
        <h1 id="s2-title" ref={titleRef} tabIndex={-1}>
          我们需要一些你的数据..
        </h1>
      </header>

      <div aria-label="数据填入方式" className="onboarding-source__options" role="group">
        <button
          className="onboarding-source-option onboarding-source-option--available"
          onClick={onChooseRandom}
          type="button"
        >
          <span className="onboarding-source-option__icon">
            <Sparkles aria-hidden="true" size={22} />
          </span>
          <span className="onboarding-source-option__copy">
            <strong>生成体验持仓</strong>
            <small>使用模拟数据直接体验完整复盘</small>
          </span>
          <ArrowRight aria-hidden="true" size={19} />
        </button>

        <button
          aria-describedby="onboarding-source-feedback"
          className="onboarding-source-option"
          onClick={() => onPlaceholder("manual")}
          type="button"
        >
          <span className="onboarding-source-option__icon">
            <PenLine aria-hidden="true" size={22} />
          </span>
          <span className="onboarding-source-option__copy">
            <strong>手动填写持仓</strong>
            <small>逐项添加并检查持仓信息</small>
          </span>
          <span className="onboarding-source-option__status">
            即将开放 <LockKeyhole aria-hidden="true" size={15} />
          </span>
        </button>

        <button
          aria-describedby="onboarding-source-feedback"
          className="onboarding-source-option"
          onClick={() => onPlaceholder("screenshot")}
          type="button"
        >
          <span className="onboarding-source-option__icon">
            <ImageUp aria-hidden="true" size={22} />
          </span>
          <span className="onboarding-source-option__copy">
            <strong>截图识别持仓</strong>
            <small>识别后仍由你逐项确认</small>
          </span>
          <span className="onboarding-source-option__status">
            即将开放 <LockKeyhole aria-hidden="true" size={15} />
          </span>
        </button>
      </div>

      <p
        className="onboarding-source__feedback"
        id="onboarding-source-feedback"
        aria-live="polite"
      >
        {placeholderMessage ?? "手动填写与截图识别将在后续版本开放。"}
      </p>

      <div className="onboarding-source__back">
        <Button onClick={onBack}>返回选择主题</Button>
      </div>
    </section>
  );
}

const CONSTRAINT_LABELS: Record<keyof PersonalConstraints, string> = {
  investment_horizon: "投资期限",
  near_term_liquidity: "近期流动性需求",
  tolerable_drawdown: "可承受回撤",
  investment_objective: "投资目标",
};

function formatConstraint(value: string): string {
  return value === "unknown" || value === "not_decided" ? "未知／尚未决定" : value;
}

function assetClassLabel(assetClass: "a_share" | "etf"): string {
  return assetClass === "a_share" ? "A 股" : "ETF";
}

export interface ExperienceSummaryScreenProps extends ScreenTitleProps {
  identity: DemoExperienceIdentity;
  onBack: () => void;
  onConfirm: () => void;
  onReroll: () => void;
}

const SUMMARY_CARDS = [
  { id: "holdings", label: "持仓数据" },
  { id: "constraints", label: "持仓偏好" },
] as const;

/** 横向切换判定阈值（px）：小于该位移视为点击而非滑动 */
const SWIPE_THRESHOLD = 56;
const DRAG_AXIS_LOCK = 8;

interface SummaryDragState {
  pointerId: number;
  startX: number;
  startY: number;
  axis: "none" | "x" | "y";
}

export function ExperienceSummaryScreen({
  identity,
  titleRef,
  onBack,
  onConfirm,
  onReroll,
}: ExperienceSummaryScreenProps) {
  const [activeCard, setActiveCard] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<SummaryDragState | null>(null);
  const suppressClick = useRef(false);

  function endDrag(): void {
    const state = dragState.current;
    dragState.current = null;
    setDragging(false);
    setDragX(0);
    if (!state || state.axis !== "x") return;
    suppressClick.current = true;
    if (dragX <= -SWIPE_THRESHOLD && activeCard < SUMMARY_CARDS.length - 1) {
      setActiveCard(activeCard + 1);
    } else if (dragX >= SWIPE_THRESHOLD && activeCard > 0) {
      setActiveCard(activeCard - 1);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (!event.isPrimary) return;
    suppressClick.current = false;
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: "none",
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (state.axis === "none") {
      if (Math.abs(dx) < DRAG_AXIS_LOCK && Math.abs(dy) < DRAG_AXIS_LOCK) return;
      state.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (state.axis === "x") {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }
    }
    if (state.axis !== "x") return;
    // 到边缘后加阻尼，提示没有更多卡片
    const atEdge =
      (dx > 0 && activeCard === 0) ||
      (dx < 0 && activeCard === SUMMARY_CARDS.length - 1);
    setDragX(atEdge ? dx / 3 : dx);
  }

  function handleRegionKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "ArrowLeft" && activeCard > 0) {
      event.preventDefault();
      setActiveCard(activeCard - 1);
    } else if (event.key === "ArrowRight" && activeCard < SUMMARY_CARDS.length - 1) {
      event.preventDefault();
      setActiveCard(activeCard + 1);
    }
  }

  return (
    <section className="onboarding-screen onboarding-summary" aria-labelledby="s3-title">
      <header className="onboarding-heading">
        <p className="onboarding-step">首次引导 · 3 / 3</p>
        <h1 id="s3-title" ref={titleRef} tabIndex={-1}>
          随机模拟数据已出炉
        </h1>
      </header>

      <div
        className="onboarding-summary__identity"
        key={identity.identity_id}
        onKeyDown={handleRegionKeyDown}
      >
        <div aria-label="模拟数据分组" className="onboarding-summary__switch" role="tablist">
          {SUMMARY_CARDS.map((card, index) => (
            <button
              aria-controls={`summary-card-${card.id}`}
              aria-selected={activeCard === index}
              className={`onboarding-summary__tab${activeCard === index ? " is-active" : ""}`}
              id={`summary-tab-${card.id}`}
              key={card.id}
              onClick={() => setActiveCard(index)}
              role="tab"
              type="button"
            >
              {card.label}
            </button>
          ))}
        </div>

        <div
          className={`onboarding-summary__stage${dragging ? " is-dragging" : ""}`}
          onPointerCancel={endDrag}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          style={{ "--drag-x": `${dragX}px` } as CSSProperties}
        >
          <section
            aria-hidden={activeCard !== 0}
            aria-labelledby="summary-tab-holdings"
            className={`onboarding-summary-card${activeCard === 0 ? " is-active" : ""}`}
            id="summary-card-holdings"
            onClick={() => {
              if (activeCard !== 0 && !suppressClick.current) setActiveCard(0);
            }}
            role="tabpanel"
            style={{ "--card-offset": 0 - activeCard } as CSSProperties}
          >
            <div className="onboarding-section-heading">
              <h2 id="holdings-title">本次模拟持仓</h2>
              <span>共 {identity.holdings.length} 项</span>
            </div>
            <div className="onboarding-holdings">
              {identity.holdings.map((holding, index) => (
                <article
                  className="onboarding-holding"
                  key={holding.line_id}
                  style={{ "--item-index": index } as CSSProperties}
                >
                  <div className="onboarding-holding__title">
                    <div>
                      <h3>{holding.name}</h3>
                      <p>
                        {assetClassLabel(holding.asset_class)} · {holding.symbol}
                        {holding.market ? ` · ${holding.market}` : ""}
                      </p>
                    </div>
                  </div>
                  <dl className="onboarding-holding__metrics">
                    <div className="onboarding-holding__metric">
                      <dt>模拟持仓</dt>
                      <dd>{holding.size_basis}</dd>
                    </div>
                    <div className="onboarding-holding__metric">
                      <dt>观察值</dt>
                      <dd>
                        {String(holding.observed_value)}
                        {holding.observed_unit ? ` ${holding.observed_unit}` : ""}
                      </dd>
                    </div>
                  </dl>
                  <dl className="onboarding-holding__meta">
                    <div>
                      <dt>数据日期</dt>
                      <dd>{holding.observation_date}</dd>
                    </div>
                    <div>
                      <dt>数据来源</dt>
                      <dd>随机生成</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section
            aria-hidden={activeCard !== 1}
            aria-labelledby="summary-tab-constraints"
            className={`onboarding-summary-card${activeCard === 1 ? " is-active" : ""}`}
            id="summary-card-constraints"
            onClick={() => {
              if (activeCard !== 1 && !suppressClick.current) setActiveCard(1);
            }}
            role="tabpanel"
            style={{ "--card-offset": 1 - activeCard } as CSSProperties}
          >
            <div className="onboarding-section-heading">
              <h2 id="constraints-title">本次模拟偏好</h2>
              <span>共 {Object.keys(CONSTRAINT_LABELS).length} 项</span>
            </div>
            <dl className="onboarding-constraints">
              {(Object.keys(CONSTRAINT_LABELS) as (keyof PersonalConstraints)[]).map((key, index) => (
                <div key={key} style={{ "--item-index": index } as CSSProperties}>
                  <dt>{CONSTRAINT_LABELS[key]}</dt>
                  <dd>{formatConstraint(identity.constraints[key])}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="onboarding-summary__pagination" aria-hidden="true">
          {SUMMARY_CARDS.map((card, index) => (
            <span
              className={`onboarding-summary__dot${activeCard === index ? " is-active" : ""}`}
              key={card.id}
            />
          ))}
        </div>
        <p className="onboarding-summary__hint" aria-live="polite">
          左右滑动或点击旁边的卡片切换 · {activeCard + 1} / {SUMMARY_CARDS.length}
        </p>
      </div>

      <div className="onboarding-sticky-spacer" aria-hidden="true" />
      <footer className="onboarding-confirm-bar">
        <div className="onboarding-confirm-bar__inner">
          <Button onClick={onBack}>上一步</Button>
          <Button onClick={onReroll}>
            <RefreshCw aria-hidden="true" size={18} />
            换一份
          </Button>
          <Button onClick={onConfirm} variant="primary">
            下一步
          </Button>
        </div>
      </footer>
    </section>
  );
}
