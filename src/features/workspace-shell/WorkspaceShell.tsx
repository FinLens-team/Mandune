import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Menu } from "lucide-react";
import type { PortfolioDraft, PortfolioSnapshot } from "../../contracts/index.js";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import { BrandBanner, IconButton } from "../../client/ui/index.js";
import nailongIntro from "../../client/assets/mascot/nailong-intro.webp";
import nailongLaugh from "../../client/assets/mascot/nailong-laugh.webp";
import { createExampleDraft } from "../../portfolio/index.js";
import { OBSERVATION_THEME } from "../../theme/observation.js";
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

function useMascotMotionEnabled(reduceMotion: boolean): {
  active: boolean;
  ref: RefObject<HTMLButtonElement | null>;
} {
  const ref = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (reduceMotion) {
      setActive(false);
      return;
    }

    let inViewport = true;
    const sync = () => setActive(document.visibilityState === "visible" && inViewport);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            inViewport = entry?.isIntersecting ?? false;
            sync();
          });

    if (ref.current) observer?.observe(ref.current);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [reduceMotion]);

  return { active, ref };
}

const HOME_SPEECH_BUBBLES = [
  "我是奶龙！哈哈哈哈哈",
  "看懂一点，安心一点",
  "笑一笑，再稳稳看",
  "先核对，再判断",
] as const;

/** Full drift cycle of one floating caption (pop in, hold, rise, fade out). */
const HOME_CAPTION_LIFETIME_MS = 3600;

interface HomeCaption {
  id: number;
  message: (typeof HOME_SPEECH_BUBBLES)[number];
  x: number;
  y: number;
}

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
}

function countKnownConstraints(draft: PortfolioDraft): number {
  return Object.values(draft.constraints).filter(
    (value) => value !== "unknown" && value !== "not_decided",
  ).length;
}

function sourceLabel(source: ExperienceSource | undefined): string {
  return source === "edited" ? "体验持仓已编辑" : "随机体验数据";
}

export function WorkspaceShell({
  activeAnalysis,
  draft: controlledDraft,
  experienceSource,
  initialDraft,
  lastAnalysisAt,
  latestCompleteTradingDay,
  onDraftChange,
  onExperienceSourceChange,
  onNavigateAbout,
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
  const [speechCaptions, setSpeechCaptions] = useState<HomeCaption[]>([]);
  const [uncontrolledReducedMotion, setUncontrolledReducedMotion] = useState(false);
  const [uncontrolledExperienceSource, setUncontrolledExperienceSource] =
    useState<DemoBadgeSource>(initialExperienceSource);
  const [uncontrolledReviewCoachmarkVisible, setUncontrolledReviewCoachmarkVisible] = useState(
    initialReviewCoachmarkVisible,
  );
  const homeHeadingRef = useRef<HTMLHeadingElement>(null);
  const introPreloadRef = useRef<HTMLImageElement | null>(null);
  const draft = controlledDraft ?? uncontrolledDraft;
  const reduceMotion = controlledReducedMotion ?? uncontrolledReducedMotion;
  const usableLineCount = draft.lines.filter((line) => line.is_usable).length;
  const knownConstraintCount = countKnownConstraints(draft);
  const homeRunStatus = activeAnalysis
    ? "复盘进行中"
    : lastAnalysisAt
      ? "已有历史复盘"
      : "复盘待开始";

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
      setSpeechCaptions([]);
      return;
    }

    let captionId = 0;
    let spawnTimer: number | undefined;
    const expireTimers = new Set<number>();

    function spawn() {
      const messageIndex = Math.floor(Math.random() * HOME_SPEECH_BUBBLES.length);
      const caption: HomeCaption = {
        id: captionId,
        message: HOME_SPEECH_BUBBLES[messageIndex] ?? HOME_SPEECH_BUBBLES[0],
        x: randomBetween(14, 72),
        y: randomBetween(12, 62),
      };
      captionId += 1;
      setSpeechCaptions((previous) => [...previous.slice(-2), caption]);
      const expire = window.setTimeout(() => {
        expireTimers.delete(expire);
        setSpeechCaptions((previous) => previous.filter((item) => item.id !== caption.id));
      }, HOME_CAPTION_LIFETIME_MS);
      expireTimers.add(expire);
      spawnTimer = window.setTimeout(spawn, randomBetween(1800, 3200));
    }

    spawnTimer = window.setTimeout(spawn, randomBetween(700, 1400));
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

                <header className="workspace-home__masthead">
                  <p className="workspace-home__theme-title">哈呃呃涨涨</p>
                </header>

                <div className="workspace-home__badges">
                  {latestCompleteTradingDay ? (
                    <span className="workspace-home__badge">
                      截至 {latestCompleteTradingDay}
                    </span>
                  ) : null}
                  <span className="workspace-home__badge workspace-home__badge--demo">
                    {sourceLabel(experienceSource)}
                  </span>
                </div>

                <div className="workspace-home__copy">
                  <h1 id="workspace-home-heading" ref={homeHeadingRef} tabIndex={-1}>
                    {activeAnalysis ? "复盘进行中" : "今日持仓观察"}
                  </h1>
                  <p className="workspace-home__subtitle">看懂一点，安心一点</p>
                  <div className="workspace-home__status-cluster" aria-label="当前复盘上下文">
                    <span className="workspace-home__status-chip">
                      {usableLineCount} 项持仓已确认
                    </span>
                    <span className="workspace-home__status-chip">
                      约束 {knownConstraintCount} / 4
                    </span>
                    <span className="workspace-home__status-chip">
                      {homeRunStatus}
                    </span>
                  </div>
                </div>

                <div aria-hidden="true" className="workspace-home__speech">
                  {speechCaptions.map((caption) => (
                    <span
                      key={caption.id}
                      style={{
                        "--bubble-x": `${caption.x}%`,
                        "--bubble-y": `${caption.y}%`,
                      } as CSSProperties}
                    >
                      {caption.message}
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
                    className="workspace-home__mascot-button"
                    onClick={(event) => activateMascot(event.currentTarget)}
                    type="button"
                  >
                    <img
                      alt=""
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
