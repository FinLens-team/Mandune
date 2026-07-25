import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Menu } from "lucide-react";
import type { PortfolioDraft, PortfolioSnapshot } from "../../contracts/index.js";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import { BrandBanner, IconButton } from "../../client/ui/index.js";
import mandongLogo from "../../client/assets/mandong-logo.webp";
import nailongIntro from "../../client/assets/mascot/nailong-intro.webp";
import nailongLaugh from "../../client/assets/mascot/nailong-laugh.webp";
import { createExampleDraft } from "../../portfolio/index.js";
import { PortfolioEditor } from "../review/ReviewPage.js";
import { snapshotCurrentDraft } from "../review/model.js";
import { AnalysisConfirmDialog } from "./AnalysisConfirmDialog.js";
import { WorkspaceDrawer, type WorkspaceView } from "./WorkspaceDrawer.js";
import "./styles.css";

type ExperienceSource = "edited" | "random";

export interface WorkspaceShellProps {
  activeAnalysis?: { analysisId: string };
  draft?: PortfolioDraft;
  experienceSource?: ExperienceSource;
  initialDraft?: PortfolioDraft;
  lastAnalysisAt?: string;
  latestCompleteTradingDay?: string;
  onDraftChange?: (draft: PortfolioDraft) => void;
  onExperienceSourceChange?: (source: ExperienceSource) => void;
  onNavigateAbout: () => void;
  onNavigateAtlas?: () => void;
  onNavigateHistory: () => void;
  onReducedMotionChange?: (enabled: boolean) => void;
  onResumeAnalysis?: (analysisId: string) => void;
  onReviewCoachmarkDismiss?: () => void;
  onStartAnalysis: (snapshot: PortfolioSnapshot) => void;
  reducedMotion?: boolean;
  reviewCoachmarkVisible?: boolean;
  workspace: WorkspacePublicStatus | null;
}

export function prepareAnalysisSnapshot(draft: PortfolioDraft) {
  return snapshotCurrentDraft(draft);
}

export function countUnknownConstraints(snapshot: PortfolioSnapshot): number {
  return Object.values(snapshot.constraints).filter(
    (value) => value === "unknown" || value === "not_decided",
  ).length;
}

/** 主题弹幕库：后续拓展主题文案时只需在此追加一条。 */
export const THEME_DANMAKU = [
  "我是奶龙！哈哈哈哈哈",
  "看懂一点，安心一点",
  "笑一笑，再稳稳看",
  "先核对，再判断",
] as const;

/** 弹幕泳道（距海报顶部的百分比）：只走顶部天空带与底部低空带，避开居中的吉祥物。 */
const DANMAKU_LANES = [6, 12, 18, 78, 84] as const;

/** 同屏弹幕上限，超出时最旧的一条让位。 */
const DANMAKU_MAX_CONCURRENT = 8;

interface TickerCandle {
  x: number;
  bodyTop: number;
  bodyHeight: number;
  wickTop: number;
  wickBottom: number;
  filled?: boolean;
}

/** 上排蜡烛（天空带，viewBox 800x780 坐标系）。 */
const TICKER_CANDLES_HIGH: readonly TickerCandle[] = [
  { x: 30, bodyTop: 120, bodyHeight: 26, wickTop: 108, wickBottom: 158, filled: true },
  { x: 95, bodyTop: 100, bodyHeight: 34, wickTop: 88, wickBottom: 146 },
  { x: 160, bodyTop: 132, bodyHeight: 20, wickTop: 120, wickBottom: 164 },
  { x: 225, bodyTop: 92, bodyHeight: 40, wickTop: 78, wickBottom: 144, filled: true },
  { x: 290, bodyTop: 118, bodyHeight: 28, wickTop: 104, wickBottom: 158 },
  { x: 355, bodyTop: 84, bodyHeight: 36, wickTop: 70, wickBottom: 132 },
  { x: 420, bodyTop: 110, bodyHeight: 24, wickTop: 98, wickBottom: 146, filled: true },
  { x: 485, bodyTop: 76, bodyHeight: 42, wickTop: 62, wickBottom: 130 },
  { x: 550, bodyTop: 104, bodyHeight: 30, wickTop: 90, wickBottom: 146 },
  { x: 615, bodyTop: 88, bodyHeight: 34, wickTop: 74, wickBottom: 134, filled: true },
  { x: 680, bodyTop: 112, bodyHeight: 22, wickTop: 100, wickBottom: 146 },
  { x: 745, bodyTop: 96, bodyHeight: 32, wickTop: 82, wickBottom: 140 },
];

/** 下排蜡烛（低空带）。 */
const TICKER_CANDLES_LOW: readonly TickerCandle[] = [
  { x: 55, bodyTop: 660, bodyHeight: 30, wickTop: 646, wickBottom: 702 },
  { x: 125, bodyTop: 640, bodyHeight: 38, wickTop: 624, wickBottom: 690, filled: true },
  { x: 195, bodyTop: 672, bodyHeight: 22, wickTop: 660, wickBottom: 706 },
  { x: 265, bodyTop: 632, bodyHeight: 42, wickTop: 616, wickBottom: 686 },
  { x: 335, bodyTop: 656, bodyHeight: 26, wickTop: 644, wickBottom: 694, filled: true },
  { x: 405, bodyTop: 626, bodyHeight: 36, wickTop: 610, wickBottom: 674 },
  { x: 475, bodyTop: 650, bodyHeight: 28, wickTop: 636, wickBottom: 690 },
  { x: 545, bodyTop: 620, bodyHeight: 40, wickTop: 606, wickBottom: 672, filled: true },
  { x: 615, bodyTop: 644, bodyHeight: 30, wickTop: 630, wickBottom: 686 },
  { x: 685, bodyTop: 634, bodyHeight: 34, wickTop: 620, wickBottom: 680 },
  { x: 755, bodyTop: 654, bodyHeight: 24, wickTop: 642, wickBottom: 690, filled: true },
];

/** 渲染一排蜡烛并复制一份到 +800，配合 ±800px 滑动形成无缝循环。 */
function TickerCandles({ candles, prefix }: { candles: readonly TickerCandle[]; prefix: string }) {
  return (
    <>
      {[...candles, ...candles.map((candle) => ({ ...candle, x: candle.x + 800 }))].map(
        (candle, index) => (
          <g key={`${prefix}-${index}`}>
            <line x1={candle.x + 6} y1={candle.wickTop} x2={candle.x + 6} y2={candle.wickBottom} />
            <rect
              data-filled={candle.filled || undefined}
              height={candle.bodyHeight}
              rx={2}
              width={12}
              x={candle.x}
              y={candle.bodyTop}
            />
          </g>
        ),
      )}
    </>
  );
}

interface HomeDanmaku {
  id: number;
  text: (typeof THEME_DANMAKU)[number];
  lane: number;
  duration: number;
}

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
}

export function WorkspaceShell({
  activeAnalysis,
  draft: controlledDraft,
  experienceSource,
  initialDraft,
  latestCompleteTradingDay,
  onDraftChange,
  onExperienceSourceChange,
  onNavigateAbout,
  onNavigateAtlas,
  onNavigateHistory,
  onResumeAnalysis,
  onReviewCoachmarkDismiss,
  onStartAnalysis,
  reducedMotion: controlledReducedMotion,
  reviewCoachmarkVisible = false,
}: WorkspaceShellProps) {
  const [uncontrolledDraft, setUncontrolledDraft] = useState(
    () => initialDraft ?? createExampleDraft(),
  );
  const [view, setView] = useState<WorkspaceView>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const [reviewTrigger, setReviewTrigger] = useState<HTMLElement | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [danmaku, setDanmaku] = useState<HomeDanmaku[]>([]);
  const [uncontrolledReducedMotion, setUncontrolledReducedMotion] = useState(false);
  const homeHeadingRef = useRef<HTMLHeadingElement>(null);
  const introPreloadRef = useRef<HTMLImageElement | null>(null);
  const draft = controlledDraft ?? uncontrolledDraft;
  const reduceMotion = controlledReducedMotion ?? uncontrolledReducedMotion;
  const homeCtaLabel = activeAnalysis ? "复盘进行中，点奶龙继续" : "点奶龙，开始今日复盘";

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (controlledReducedMotion === undefined && media?.matches) {
      setUncontrolledReducedMotion(true);
    }
  }, [controlledReducedMotion]);

  useEffect(() => {
    if (view === "home") homeHeadingRef.current?.focus();
  }, [view]);

  useEffect(() => {
    function onVisibilityChange() {
      setPageVisible(document.visibilityState !== "hidden");
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (view !== "home" || introPreloadRef.current) return;
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = nailongIntro;
    introPreloadRef.current = image;
  }, [view]);

  useEffect(() => {
    if (reduceMotion || !pageVisible || view !== "home") {
      setDanmaku([]);
      return;
    }

    let danmakuId = 0;
    let spawnTimer: number | undefined;
    const expireTimers = new Set<number>();
    const activeTexts = new Set<string>();

    function spawn() {
      // 同一句文案未飞出屏幕前不重复生成
      const pool = THEME_DANMAKU.filter((text) => !activeTexts.has(text));
      if (pool.length === 0) {
        spawnTimer = window.setTimeout(spawn, randomBetween(1200, 2000));
        return;
      }
      const item: HomeDanmaku = {
        id: danmakuId,
        text: pool[Math.floor(Math.random() * pool.length)] ?? THEME_DANMAKU[0],
        lane: DANMAKU_LANES[Math.floor(Math.random() * DANMAKU_LANES.length)] ?? DANMAKU_LANES[0],
        duration: randomBetween(8, 12),
      };
      danmakuId += 1;
      activeTexts.add(item.text);
      setDanmaku((previous) => [...previous.slice(-(DANMAKU_MAX_CONCURRENT - 1)), item]);
      const expire = window.setTimeout(() => {
        expireTimers.delete(expire);
        activeTexts.delete(item.text);
        setDanmaku((previous) => previous.filter((entry) => entry.id !== item.id));
      }, item.duration * 1000 + 400);
      expireTimers.add(expire);
      spawnTimer = window.setTimeout(spawn, randomBetween(2200, 3800));
    }

    spawn();
    return () => {
      if (spawnTimer !== undefined) window.clearTimeout(spawnTimer);
      for (const timer of expireTimers) window.clearTimeout(timer);
    };
  }, [pageVisible, reduceMotion, view]);

  function activateMascot(trigger: HTMLElement) {
    setReviewTrigger(trigger);
    onReviewCoachmarkDismiss?.();

    if (activeAnalysis) {
      onResumeAnalysis?.(activeAnalysis.analysisId);
      return;
    }

    const result = prepareAnalysisSnapshot(draft);
    if (!result.ok) {
      setMessage(result.message);
      setView("portfolio");
      return;
    }

    setMessage(null);
    setPendingSnapshot(result.snapshot);
    setConfirmOpen(true);
  }

  function navigate(nextView: WorkspaceView) {
    setView(nextView);
    setMessage(null);
  }

  function changeDraft(nextDraft: PortfolioDraft) {
    if (controlledDraft === undefined) setUncontrolledDraft(nextDraft);
    onDraftChange?.(nextDraft);
    if (experienceSource === "random") onExperienceSourceChange?.("edited");
  }

  function openDrawer(trigger: HTMLElement) {
    setDrawerTrigger(trigger);
    setDrawerOpen(true);
  }

  return (
    <>
      {view === "portfolio" ? <BrandBanner /> : null}
      <div
        className="workspace-shell"
        data-reduce-motion={reduceMotion || undefined}
        data-view={view}
      >
        <a className="skip-link" href="#workspace-main">
          跳到主要内容
        </a>

        <main id="workspace-main">
          {view === "home" ? (
            <section className="workspace-home" aria-labelledby="workspace-home-heading">
              <div className="workspace-home__poster">
                {/* Symbolic candle clusters — pure decoration, not market data */}
                <svg
                  aria-hidden="true"
                  className="workspace-home__ticker"
                  fill="none"
                  preserveAspectRatio="xMidYMid slice"
                  viewBox="0 0 800 780"
                >
                  <g className="workspace-home__ticker-line workspace-home__ticker-line--high">
                    <TickerCandles candles={TICKER_CANDLES_HIGH} prefix="h" />
                  </g>
                  <g className="workspace-home__ticker-line workspace-home__ticker-line--low">
                    <TickerCandles candles={TICKER_CANDLES_LOW} prefix="l" />
                  </g>
                </svg>

                <h1
                  className="workspace-home__sr-only"
                  id="workspace-home-heading"
                  ref={homeHeadingRef}
                  tabIndex={-1}
                >
                  满懂 · 每日复盘
                </h1>

                <div className="workspace-home__topbar">
                  <img
                    alt="满懂"
                    className="workspace-home__brand-mark"
                    decoding="async"
                    height={317}
                    src={mandongLogo}
                    width={1200}
                  />
                  <span className="workspace-home__page-label">主页</span>
                </div>

                <div aria-hidden="true" className="workspace-home__danmaku">
                  {danmaku.map((item) => (
                    <span
                      key={item.id}
                      style={{
                        "--danmaku-lane": `${item.lane}%`,
                        "--danmaku-duration": `${item.duration}s`,
                      } as CSSProperties}
                    >
                      {item.text}
                    </span>
                  ))}
                </div>

                <div
                  className="workspace-home__stage"
                  data-coachmark={reviewCoachmarkVisible || undefined}
                >
                  <button
                    aria-label={activeAnalysis
                      ? "点击奶龙，继续查看正在运行的复盘"
                      : "点击奶龙，确认发起今日复盘"}
                    className="workspace-home__hero"
                    onClick={(event) => activateMascot(event.currentTarget)}
                    type="button"
                  >
                    <img
                      alt=""
                      className="workspace-home__mascot"
                      decoding="async"
                      fetchPriority="high"
                      height="838"
                      src={nailongLaugh}
                      width="658"
                    />
                  </button>
                </div>

                <div className="workspace-home__menu">
                  <IconButton
                    className="workspace-home__menu-button"
                    icon={Menu}
                    label="打开工作区导航"
                    onClick={(event) => openDrawer(event.currentTarget)}
                    tooltip="工作区导航"
                  />
                  <p className="workspace-home__hint">{homeCtaLabel}</p>
                </div>
              </div>

              {message ? (
                <p className="workspace-shell__message" role="status">
                  {message}
                </p>
              ) : null}
            </section>
          ) : (
            <div className="workspace-shell__view workspace-shell__view--data">
              <PortfolioEditor
                draft={draft}
                onCancel={() => navigate("home")}
                onChange={changeDraft}
                onSave={() => navigate("home")}
              />
            </div>
          )}
        </main>

        {view === "portfolio" ? (
          <div className="workspace-shell__menu">
            <IconButton
              icon={Menu}
              label="打开工作区导航"
              onClick={(event) => openDrawer(event.currentTarget)}
              tooltip="工作区导航"
            />
          </div>
        ) : null}

        <WorkspaceDrawer
          currentView={view}
          onClose={() => setDrawerOpen(false)}
          onNavigate={navigate}
          onNavigateAbout={onNavigateAbout}
          onNavigateAtlas={onNavigateAtlas}
          onNavigateHistory={onNavigateHistory}
          open={drawerOpen}
          reduceMotion={reduceMotion}
          returnFocus={drawerTrigger}
        />

        <AnalysisConfirmDialog
          experienceSource={experienceSource}
          latestCompleteTradingDay={latestCompleteTradingDay}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={(snapshot) => {
            setConfirmOpen(false);
            onStartAnalysis(snapshot);
          }}
          open={confirmOpen}
          reduceMotion={reduceMotion}
          returnFocus={reviewTrigger}
          snapshot={pendingSnapshot}
        />
      </div>
    </>
  );
}
