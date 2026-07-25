import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Menu } from "lucide-react";
import type { PortfolioDraft, PortfolioSnapshot } from "../../contracts/index.js";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import { BrandBanner, IconButton } from "../../client/ui/index.js";
import mandongLogo from "../../client/assets/mandong-logo.webp";
import { createExampleDraft } from "../../portfolio/index.js";
import { themeForId, type ThemeId } from "../../theme/index.js";
import { themeClientAssets, themeCssVariables } from "../../theme/client.js";
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
  /** Entry view for this mount; the drawer on secondary pages uses it to land on 数据管理. */
  initialView?: WorkspaceView;
  lastAnalysisAt?: string;
  latestCompleteTradingDay?: string;
  onDraftChange?: (draft: PortfolioDraft) => void;
  onExperienceSourceChange?: (source: ExperienceSource) => void;
  onNavigateAbout: () => void;
  onNavigateAtlas?: () => void;
  onNavigateHistory: () => void;
  onNavigateTheme: () => void;
  onReducedMotionChange?: (enabled: boolean) => void;
  onResumeAnalysis?: (analysisId: string) => void;
  onReviewCoachmarkDismiss?: () => void;
  onStartAnalysis: (snapshot: PortfolioSnapshot) => void;
  reducedMotion?: boolean;
  reviewCoachmarkVisible?: boolean;
  themeId?: ThemeId;
  workspace: WorkspacePublicStatus | null;
}

export function prepareAnalysisSnapshot(draft: PortfolioDraft, themeId?: ThemeId) {
  return snapshotCurrentDraft(draft, themeId);
}

export function countUnknownConstraints(snapshot: PortfolioSnapshot): number {
  return Object.values(snapshot.constraints).filter(
    (value) => value === "unknown" || value === "not_decided",
  ).length;
}

export function formatConstraintValue(value: string): string {
  return value === "unknown" || value === "not_decided" ? "未知／尚未决定" : value;
}

/** 弹幕泳道（距海报顶部的百分比）：只走顶部天空带与底部低空带，避开居中的吉祥物。 */
const DANMAKU_LANES = [6, 12, 18, 78, 84] as const;

/** 同屏弹幕上限，超出时最旧的一条让位。 */
const DANMAKU_MAX_CONCURRENT = 8;

interface HomeDanmaku {
  id: number;
  text: string;
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
  initialView,
  onDraftChange,
  onExperienceSourceChange,
  onNavigateAbout,
  onNavigateAtlas,
  onNavigateHistory,
  onNavigateTheme,
  onResumeAnalysis,
  onReviewCoachmarkDismiss,
  onStartAnalysis,
  reducedMotion: controlledReducedMotion,
  reviewCoachmarkVisible = false,
  themeId = "eastern_observation",
}: WorkspaceShellProps) {
  const [uncontrolledDraft, setUncontrolledDraft] = useState(
    () => initialDraft ?? createExampleDraft(),
  );
  const [view, setView] = useState<WorkspaceView>(initialView ?? "home");
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
  const draft = controlledDraft ?? uncontrolledDraft;
  const reduceMotion = controlledReducedMotion ?? uncontrolledReducedMotion;
  const theme = themeForId(themeId);
  const themeAssets = themeClientAssets(themeId);
  const homeCtaLabel = activeAnalysis ? theme.copy.resumeAction : theme.copy.homeAction;

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
      const pool = theme.copy.danmaku.filter((text) => !activeTexts.has(text));
      if (pool.length === 0) {
        spawnTimer = window.setTimeout(spawn, randomBetween(1200, 2000));
        return;
      }
      const item: HomeDanmaku = {
        id: danmakuId,
        text: pool[Math.floor(Math.random() * pool.length)] ?? theme.copy.danmaku[0] ?? "先核对，再判断",
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
  }, [pageVisible, reduceMotion, theme.copy.danmaku, view]);

  function activateMascot(trigger: HTMLElement) {
    setReviewTrigger(trigger);
    onReviewCoachmarkDismiss?.();

    if (activeAnalysis) {
      onResumeAnalysis?.(activeAnalysis.analysisId);
      return;
    }

    const result = prepareAnalysisSnapshot(draft, theme.id);
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
        data-theme={theme.id}
        data-reduce-motion={reduceMotion || undefined}
        data-view={view}
        style={themeCssVariables(theme.id)}
      >
        <a className="skip-link" href="#workspace-main">
          跳到主要内容
        </a>

        <main id="workspace-main">
          {view === "home" ? (
            <section className="workspace-home" aria-labelledby="workspace-home-heading">
              <div className="workspace-home__poster">
                {/* Symbolic drifting sparklines — pure decoration, not market data */}
                <svg
                  aria-hidden="true"
                  className="workspace-home__ticker"
                  fill="none"
                  preserveAspectRatio="xMidYMid slice"
                  viewBox="0 0 800 780"
                >
                  <g className="workspace-home__ticker-line workspace-home__ticker-line--high">
                    <path d="M0 150 L65 128 L130 168 L200 112 L270 148 L340 96 L410 136 L480 84 L550 124 L620 72 L690 110 L800 150 L865 128 L930 168 L1000 112 L1070 148 L1140 96 L1210 136 L1280 84 L1350 124 L1420 72 L1490 110 L1600 150" />
                  </g>
                  <g className="workspace-home__ticker-line workspace-home__ticker-line--mid">
                    <path d="M0 420 L55 386 L110 442 L170 368 L235 410 L300 332 L360 372 L425 300 L485 346 L550 276 L615 324 L670 256 L730 306 L800 420 L855 386 L910 442 L970 368 L1035 410 L1100 332 L1160 372 L1225 300 L1285 346 L1350 276 L1415 324 L1470 256 L1530 306 L1600 420" />
                  </g>
                  <g className="workspace-home__ticker-line workspace-home__ticker-line--low">
                    <path d="M0 585 L70 605 L140 560 L210 596 L280 544 L350 576 L420 520 L490 556 L560 500 L630 538 L700 486 L800 585 L870 605 L940 560 L1010 596 L1080 544 L1150 576 L1220 520 L1290 556 L1360 500 L1430 538 L1500 486 L1600 585" />
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
                      ? `点击${theme.mascot.name}，继续查看正在运行的复盘`
                      : `点击${theme.mascot.name}，确认发起今日复盘`}
                    className="workspace-home__hero"
                    onClick={(event) => activateMascot(event.currentTarget)}
                    type="button"
                  >
                    <img
                      alt=""
                      className="workspace-home__mascot"
                      decoding="async"
                      fetchPriority="high"
                      height={themeAssets.home.height}
                      src={themeAssets.home.src}
                      width={themeAssets.home.width}
                    />
                    <span className="workspace-home__hint">{homeCtaLabel}</span>
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
          currentPage={view}
          onClose={() => setDrawerOpen(false)}
          onNavigateAbout={onNavigateAbout}
          onNavigateAtlas={onNavigateAtlas}
          onNavigateHistory={onNavigateHistory}
          onNavigateTheme={onNavigateTheme}
          onNavigateHome={() => navigate("home")}
          onNavigatePortfolio={() => navigate("portfolio")}
          open={drawerOpen}
          reduceMotion={reduceMotion}
          returnFocus={drawerTrigger}
        />

        <AnalysisConfirmDialog
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
