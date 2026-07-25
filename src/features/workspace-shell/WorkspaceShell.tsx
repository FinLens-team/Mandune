import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { Menu } from "lucide-react";
import type { PortfolioDraft, PortfolioSnapshot } from "../../contracts/index.js";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import { IconButton } from "../../client/ui/index.js";
import { createExampleDraft } from "../../portfolio/index.js";
import { OBSERVATION_THEME } from "../../theme/observation.js";
import { PortfolioEditor } from "../review/ReviewPage.js";
import { snapshotCurrentDraft } from "../review/model.js";
import { AnalysisConfirmDialog } from "./AnalysisConfirmDialog.js";
import { WorkspaceDrawer, type WorkspaceView } from "./WorkspaceDrawer.js";
import "./styles.css";

export interface WorkspaceShellProps {
  activeAnalysis?: { analysisId: string };
  draft?: PortfolioDraft;
  experienceSource?: DemoBadgeSource;
  initialExperienceSource?: DemoBadgeSource;
  initialDraft?: PortfolioDraft;
  initialReviewCoachmarkVisible?: boolean;
  onDraftChange?: (draft: PortfolioDraft) => void;
  onExperienceSourceChange?: (source: DemoBadgeSource) => void;
  workspace: WorkspacePublicStatus | null;
  latestCompleteTradingDay?: string;
  lastAnalysisAt?: string;
  onReducedMotionChange?: (enabled: boolean) => void;
  onResumeAnalysis?: (analysisId: string) => void;
  onStartAnalysis: (snapshot: PortfolioSnapshot) => void;
  onNavigateHistory: () => void;
  onNavigateAtlas?: () => void;
  onNavigateAbout: () => void;
  reducedMotion?: boolean;
  reviewCoachmarkVisible?: boolean;
  onReviewCoachmarkDismiss?: () => void;
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

export function WorkspaceShell({
  activeAnalysis,
  draft: controlledDraft,
  experienceSource: controlledExperienceSource,
  initialExperienceSource = "random",
  initialDraft,
  initialReviewCoachmarkVisible = true,
  lastAnalysisAt,
  latestCompleteTradingDay,
  onNavigateAbout,
  onNavigateHistory,
  onNavigateAtlas,
  onDraftChange,
  onExperienceSourceChange,
  onReviewCoachmarkDismiss,
  onReducedMotionChange,
  onResumeAnalysis,
  onStartAnalysis,
  reducedMotion: controlledReducedMotion,
  reviewCoachmarkVisible: controlledReviewCoachmarkVisible,
  workspace,
}: WorkspaceShellProps) {
  const [uncontrolledDraft, setUncontrolledDraft] = useState(
    () => initialDraft ?? createExampleDraft(),
  );
  const [view, setView] = useState<WorkspaceView>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uncontrolledReducedMotion, setUncontrolledReducedMotion] = useState(false);
  const [uncontrolledExperienceSource, setUncontrolledExperienceSource] =
    useState<DemoBadgeSource>(initialExperienceSource);
  const [uncontrolledReviewCoachmarkVisible, setUncontrolledReviewCoachmarkVisible] = useState(
    initialReviewCoachmarkVisible,
  );
  const homeHeadingRef = useRef<HTMLHeadingElement>(null);
  const draft = controlledDraft ?? uncontrolledDraft;
  const reduceMotion = controlledReducedMotion ?? uncontrolledReducedMotion;
  const experienceSource = controlledExperienceSource ?? uncontrolledExperienceSource;
  const reviewCoachmarkVisible =
    controlledReviewCoachmarkVisible ?? uncontrolledReviewCoachmarkVisible;
  const mascotMotion = useMascotMotionEnabled(reduceMotion);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (controlledReducedMotion === undefined && media?.matches) {
      setUncontrolledReducedMotion(true);
    }
  }, [controlledReducedMotion]);

  useEffect(() => {
    if (view === "home") homeHeadingRef.current?.focus();
  }, [view]);

  function openConfirmation(event: MouseEvent<HTMLElement>) {
    const result = prepareAnalysisSnapshot(draft);
    if (!result.ok) {
      setMessage(result.message);
      setView("portfolio");
      return;
    }
    setPendingSnapshot(result.snapshot);
    setConfirmTrigger(event.currentTarget);
    if (reviewCoachmarkVisible) {
      if (controlledReviewCoachmarkVisible === undefined) {
        setUncontrolledReviewCoachmarkVisible(false);
      }
      onReviewCoachmarkDismiss?.();
    }
    setMessage(
      result.skippedCount > 0
        ? `${result.skippedCount} 条未决持仓不会进入本次复盘。`
        : null,
    );
    setConfirmOpen(true);
  }

  function navigate(nextView: WorkspaceView) {
    setView(nextView);
    setMessage(null);
  }

  function changeDraft(nextDraft: PortfolioDraft) {
    if (controlledDraft === undefined) setUncontrolledDraft(nextDraft);
    onDraftChange?.(nextDraft);
  }

  function changeReducedMotion(enabled: boolean) {
    if (controlledReducedMotion === undefined) setUncontrolledReducedMotion(enabled);
    onReducedMotionChange?.(enabled);
  }

  return (
    <div className="workspace-shell" data-reduce-motion={reduceMotion || undefined}>
      <a className="skip-link" href="#workspace-main">
        跳到主要内容
      </a>
      <header className="workspace-shell__topbar">
        <span className="workspace-shell__brand">满懂</span>
      </header>

      <main id="workspace-main">
        {view === "home" ? (
          <section className="workspace-home" aria-labelledby="workspace-home-heading">
            <div className="workspace-home__status">
              <p>东方观象 · 今日复盘入口</p>
              <h1 id="workspace-home-heading" ref={homeHeadingRef} tabIndex={-1}>
                和兜兜一起，核对今天能确认的变化
              </h1>
              {activeAnalysis ? <p>已有复盘仍在进行，点击兜兜继续查看。</p> : null}
            </div>

            <div className="workspace-mascot-stage">
              <button
                aria-describedby={reviewCoachmarkVisible ? "workspace-review-coachmark" : undefined}
                aria-label="点击兜兜，确认发起今日复盘"
                className="workspace-mascot-button"
                data-breathing={mascotMotion.active || undefined}
                onClick={openConfirmation}
                ref={mascotMotion.ref}
                type="button"
              >
                <img
                  alt={OBSERVATION_THEME.mascot.alt}
                  className="workspace-mascot"
                  height="512"
                  src={doudouObserver}
                  width="512"
                />
              </button>
              {reviewCoachmarkVisible ? (
                <p className="workspace-review-coachmark" id="workspace-review-coachmark">
                  点击兜兜，先确认本次复盘
                </p>
              ) : null}
            </div>

            {activeAnalysis && onResumeAnalysis ? (
              <div className="workspace-home__actions">
                <Button
                  onClick={() => onResumeAnalysis(activeAnalysis.analysisId)}
                  variant="secondary"
                >
                  返回分析进度
                </Button>
              </div>
            ) : null}
            {message ? (
              <p className="workspace-shell__message" role="status">
                {message}
              </p>
            ) : null}
          </section>
        ) : (
          <PortfolioEditor
            draft={draft}
            onCancel={() => navigate("home")}
            onChange={changeDraft}
            onSave={() => navigate("home")}
          />
        )}
      </main>

      <div className="workspace-shell__menu">
        <IconButton
          icon={Menu}
          label="打开工作区导航"
          onClick={(event) => {
            setDrawerTrigger(event.currentTarget);
            setDrawerOpen(true);
          }}
          tooltip="工作区导航"
        />
      </div>

      <WorkspaceDrawer
        currentView={view}
        experienceSource={experienceSource}
        onClose={() => setDrawerOpen(false)}
        onNavigate={navigate}
        onNavigateAbout={onNavigateAbout}
        onNavigateHistory={onNavigateHistory}
        onNavigateAtlas={onNavigateAtlas}
        onReduceMotionChange={changeReducedMotion}
        open={drawerOpen}
        reduceMotion={reduceMotion}
        returnFocus={drawerTrigger}
        workspace={workspace}
      />

      <AnalysisConfirmDialog
        latestCompleteTradingDay={latestCompleteTradingDay}
        experienceSource={experienceSource}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingSnapshot(null);
        }}
        onConfirm={(snapshot) => {
          setConfirmOpen(false);
          setPendingSnapshot(null);
          onStartAnalysis(snapshot);
        }}
        open={confirmOpen}
        reduceMotion={reduceMotion}
        returnFocus={confirmTrigger}
        snapshot={pendingSnapshot}
      />
    </div>
  );
}
