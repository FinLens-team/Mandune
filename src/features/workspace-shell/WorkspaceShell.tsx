import { useEffect, useRef, useState, type MouseEvent } from "react";
import { BriefcaseBusiness, Menu } from "lucide-react";
import type { PortfolioDraft, PortfolioSnapshot } from "../../contracts/index.js";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import { Button, DemoBadge, IconButton } from "../../client/ui/index.js";
import { createExampleDraft } from "../../portfolio/index.js";
import { PortfolioEditor } from "../review/ReviewPage.js";
import { snapshotCurrentDraft } from "../review/model.js";
import { AnalysisConfirmDialog } from "./AnalysisConfirmDialog.js";
import { WorkspaceDrawer, type WorkspaceView } from "./WorkspaceDrawer.js";
import "./styles.css";

export interface WorkspaceShellProps {
  activeAnalysis?: { analysisId: string };
  draft?: PortfolioDraft;
  initialDraft?: PortfolioDraft;
  onDraftChange?: (draft: PortfolioDraft) => void;
  workspace: WorkspacePublicStatus | null;
  latestCompleteTradingDay?: string;
  lastAnalysisAt?: string;
  onReducedMotionChange?: (enabled: boolean) => void;
  onResumeAnalysis?: (analysisId: string) => void;
  onStartAnalysis: (snapshot: PortfolioSnapshot) => void;
  onNavigateHistory: () => void;
  onNavigateAbout: () => void;
  reducedMotion?: boolean;
}

export function prepareAnalysisSnapshot(draft: PortfolioDraft) {
  return snapshotCurrentDraft(draft);
}

export function WorkspaceShell({
  activeAnalysis,
  draft: controlledDraft,
  initialDraft,
  lastAnalysisAt,
  latestCompleteTradingDay,
  onNavigateAbout,
  onNavigateHistory,
  onDraftChange,
  onReducedMotionChange,
  onResumeAnalysis,
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTrigger, setConfirmTrigger] = useState<HTMLElement | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<PortfolioSnapshot | null>(null);
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

  function openConfirmation(event: MouseEvent<HTMLElement>) {
    const result = prepareAnalysisSnapshot(draft);
    if (!result.ok) {
      setMessage(result.message);
      setView("portfolio");
      return;
    }
    setPendingSnapshot(result.snapshot);
    setConfirmTrigger(event.currentTarget);
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
              <p>
                体验证据将在发起后按最新完整交易日核对；缺失或失败会保持未知，不会补写成当前值。
              </p>
              {lastAnalysisAt ? <p>最近一次复盘：{lastAnalysisAt}</p> : null}
              {savedSnapshotId ? <p>已保存输入快照：{savedSnapshotId}</p> : null}
              {activeAnalysis ? <p>已有复盘仍在进行，可返回同一任务继续查看。</p> : null}
            </div>

            <button
              aria-label="点击兜兜，确认发起今日复盘"
              className="workspace-mascot-button"
              onClick={openConfirmation}
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

            <div className="workspace-home__actions">
              <Button onClick={openConfirmation} variant="primary">
                发起今日复盘
              </Button>
              <Button onClick={() => navigate("portfolio")} variant="secondary">
                <BriefcaseBusiness aria-hidden="true" size={20} />
                查看持仓与约束
              </Button>
              {activeAnalysis && onResumeAnalysis ? (
                <Button
                  onClick={() => onResumeAnalysis(activeAnalysis.analysisId)}
                  variant="secondary"
                >
                  返回分析进度
                </Button>
              ) : null}
            </div>
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

      <AnalysisConfirmDialog
        latestCompleteTradingDay={latestCompleteTradingDay}
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
