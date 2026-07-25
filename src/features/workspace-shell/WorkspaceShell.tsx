import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import type { PortfolioDraft, PortfolioSnapshot } from "../../contracts/index.js";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import { DemoBadge, IconButton } from "../../client/ui/index.js";
import { createExampleDraft } from "../../portfolio/index.js";
import { PortfolioEditor } from "../review/ReviewPage.js";
import { snapshotCurrentDraft } from "../review/model.js";
import { WorkspaceDrawer, type WorkspaceView } from "./WorkspaceDrawer.js";
import "./styles.css";

export interface WorkspaceShellProps {
  activeAnalysis?: { analysisId: string };
  draft?: PortfolioDraft;
  initialDraft?: PortfolioDraft;
  onDraftChange?: (draft: PortfolioDraft) => void;
  workspace: WorkspacePublicStatus | null;
  onReducedMotionChange?: (enabled: boolean) => void;
  onStartAnalysis: (snapshot: PortfolioSnapshot) => void;
  onNavigateHistory: () => void;
  onNavigateAbout: () => void;
  reducedMotion?: boolean;
}

export function prepareAnalysisSnapshot(draft: PortfolioDraft) {
  return snapshotCurrentDraft(draft);
}

export function countUnknownConstraints(snapshot: PortfolioSnapshot): number {
  return Object.values(snapshot.constraints).filter(
    (value) => value === "unknown" || value === "not_decided",
  ).length;
}

export function WorkspaceShell({
  activeAnalysis,
  draft: controlledDraft,
  initialDraft,
  onNavigateAbout,
  onNavigateHistory,
  onDraftChange,
  onReducedMotionChange,
  onStartAnalysis,
  reducedMotion: controlledReducedMotion,
  workspace,
}: WorkspaceShellProps) {
  const [uncontrolledDraft, setUncontrolledDraft] = useState(
    () => initialDraft ?? createExampleDraft(),
  );
  const [view, setView] = useState<WorkspaceView>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const [savedSnapshotId, setSavedSnapshotId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uncontrolledReducedMotion, setUncontrolledReducedMotion] = useState(false);
  const homeHeadingRef = useRef<HTMLHeadingElement>(null);
  const draft = controlledDraft ?? uncontrolledDraft;
  const reduceMotion = controlledReducedMotion ?? uncontrolledReducedMotion;

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (controlledReducedMotion === undefined && media?.matches) {
      setUncontrolledReducedMotion(true);
    }
  }, [controlledReducedMotion]);

  useEffect(() => {
    if (view === "home") homeHeadingRef.current?.focus();
  }, [view]);

  function startToday() {
    const result = prepareAnalysisSnapshot(draft);
    if (!result.ok) {
      setMessage(result.message);
      setView("portfolio");
      return;
    }
    onStartAnalysis(result.snapshot);
  }

  function navigate(nextView: WorkspaceView) {
    setView(nextView);
    setMessage(null);
  }

  function changeDraft(nextDraft: PortfolioDraft) {
    if (controlledDraft === undefined) setUncontrolledDraft(nextDraft);
    onDraftChange?.(nextDraft);
    setSavedSnapshotId(null);
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
        <DemoBadge />
      </header>

      <main id="workspace-main">
        {view === "home" ? (
          <section className="workspace-home" aria-labelledby="workspace-home-heading">
            <div className="workspace-home__status">
              <p>东方观象 · 今日复盘入口</p>
              <h1 id="workspace-home-heading" ref={homeHeadingRef} tabIndex={-1}>
                和兜兜一起，核对今天能确认的变化
              </h1>
              {savedSnapshotId ? <p>已保存输入快照：{savedSnapshotId}</p> : null}
              {activeAnalysis ? <p>已有复盘仍在进行，点击兜兜继续查看。</p> : null}
            </div>

            <button
              aria-label="点击兜兜，发起今日复盘"
              className="workspace-mascot-button"
              onClick={startToday}
              type="button"
            >
              <span className="workspace-mascot" role="img" aria-label="熊猫兜兜，东方观象向导">
                <span className="workspace-mascot__ear workspace-mascot__ear--left" />
                <span className="workspace-mascot__ear workspace-mascot__ear--right" />
                <span className="workspace-mascot__face">
                  <span className="workspace-mascot__eye workspace-mascot__eye--left" />
                  <span className="workspace-mascot__eye workspace-mascot__eye--right" />
                  <span className="workspace-mascot__nose" />
                </span>
                <span className="workspace-mascot__coat" />
              </span>
            </button>
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
            onSave={(snapshot) => {
              setSavedSnapshotId(snapshot.snapshot_id);
              navigate("home");
            }}
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
        onClose={() => setDrawerOpen(false)}
        onNavigate={navigate}
        onNavigateAbout={onNavigateAbout}
        onNavigateHistory={onNavigateHistory}
        onReduceMotionChange={changeReducedMotion}
        open={drawerOpen}
        reduceMotion={reduceMotion}
        returnFocus={drawerTrigger}
        workspace={workspace}
      />
    </div>
  );
}
