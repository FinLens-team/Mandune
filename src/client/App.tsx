import { useEffect, useReducer, useRef } from "react";
import {
  FetchJourneyGateway,
  JourneyController,
  createJourneyPersistence,
  getBrowserJourneyStorage,
  initialJourneyState,
  journeyReducer,
  type JourneyGateway,
  type JourneyPersistence,
} from "../app/client/index.js";
import { Button, DemoBadge } from "./ui/index.js";
import { AnalysisProgress } from "../features/analysis-progress/index.js";
import { HistoryAboutView } from "../features/history-view/index.js";
import { LongCard } from "../features/long-card/LongCard.js";
import { OnboardingFlow } from "../features/onboarding/index.js";
import { WorkspaceShell } from "../features/workspace-shell/index.js";
import "../app/client/styles.css";

export interface AppProps {
  gateway?: JourneyGateway;
  persistence?: JourneyPersistence;
}

function latestCompleteTradingDay(draft: NonNullable<ReturnType<typeof useJourney>[0]["draft"]>) {
  const dates = draft.lines
    .map((line) => line.observation_date)
    .filter((value): value is string => /^\d{4}-\d{2}-\d{2}$/.test(value));
  return dates.sort().at(-1);
}

function useJourney(props: AppProps) {
  const [state, dispatch] = useReducer(journeyReducer, initialJourneyState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const gatewayRef = useRef<JourneyGateway | null>(null);
  const persistenceRef = useRef<JourneyPersistence | null>(null);
  const controllerRef = useRef<JourneyController | null>(null);

  if (!gatewayRef.current) gatewayRef.current = props.gateway ?? new FetchJourneyGateway();
  if (!persistenceRef.current) {
    persistenceRef.current = props.persistence ?? createJourneyPersistence(getBrowserJourneyStorage());
  }
  if (!controllerRef.current) {
    controllerRef.current = new JourneyController({
      dispatch,
      gateway: gatewayRef.current,
      getState: () => stateRef.current,
      persistence: persistenceRef.current,
      prefersReducedMotion: () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    });
  }
  return [state, controllerRef.current, gatewayRef.current] as const;
}

function JourneyStatePage({
  action,
  actionLabel,
  heading,
  message,
}: {
  action: () => void;
  actionLabel: string;
  heading: string;
  message: string;
}) {
  return (
    <main className="journey-state" id="main" role="status">
      <DemoBadge />
      <h1>{heading}</h1>
      <p>{message}</p>
      <Button onClick={action} variant="primary">{actionLabel}</Button>
    </main>
  );
}

export function App(props: AppProps = {}) {
  const [state, controller, gateway] = useJourney(props);
  const bootStarted = useRef(false);

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    void controller.bootstrap();
  }, [controller]);

  useEffect(() => {
    const active = state.activeAnalysis;
    if (state.phase !== "analysis" || !active || active.terminal) return;
    void controller.refreshAnalysis(active.analysisId);
    const poll = window.setInterval(() => {
      void controller.refreshAnalysis(active.analysisId);
    }, gateway.pollIntervalMs);
    return () => window.clearInterval(poll);
  }, [controller, gateway.pollIntervalMs, state.activeAnalysis, state.phase]);

  if (state.phase === "booting") {
    return (
      <main aria-live="polite" className="journey-state" id="main" role="status">
        <span className="journey-state__pulse" aria-hidden="true" />
        <h1>正在准备匿名私密工作区</h1>
        <p>只读取 HttpOnly Cookie 授权的当前工作区，不把定位信息放入页面或 URL。</p>
      </main>
    );
  }

  if (state.phase === "workspace_error") {
    return (
      <JourneyStatePage
        action={() => state.workspace ? controller.resetOnboarding() : void controller.bootstrap()}
        actionLabel={state.workspace ? "重新完成体验身份" : "重新连接工作区"}
        heading="当前无法进入私密工作区"
        message={state.message ?? "工作区读取失败。"}
      />
    );
  }

  if (state.phase === "deleted") {
    return (
      <JourneyStatePage
        action={() => void controller.bootstrap()}
        actionLabel="创建新的匿名工作区"
        heading="工作区已删除"
        message="持仓、约束、分析任务与历史已清除，无法通过正常产品路径恢复。"
      />
    );
  }

  if (state.phase === "onboarding" && state.workspace) {
    return (
      <OnboardingFlow
        key={`${state.workspace.workspace_id}:${state.onboardingRevision}`}
        onEnterApp={(exit) => void controller.enterApp(exit)}
        reducedMotion={state.reducedMotion}
        workspaceId={state.workspace.workspace_id}
      />
    );
  }

  if (state.phase === "analysis" && state.activeAnalysis) {
    return (
      <div className="journey-analysis">
        <AnalysisProgress
          analysisId={state.activeAnalysis.analysisId}
          connection={state.activeAnalysis.connection}
          events={state.activeAnalysis.events}
          onLeave={() => controller.leaveAnalysis()}
          onOpenResult={() => controller.openCurrentResult()}
          onRetry={() => state.draft && void controller.startAnalysis(state.draft)}
          reduceMotion={state.reducedMotion}
          terminal={state.activeAnalysis.terminal}
        />
        {state.activeAnalysis.terminal ? (
          <nav aria-label="终态恢复" className="journey-analysis__terminal-actions">
            <Button onClick={() => controller.navigate("home")} variant="secondary">
              返回主页
            </Button>
          </nav>
        ) : null}
      </div>
    );
  }

  if (state.phase === "result" && state.displayedResult) {
    return (
      <main className="journey-result" id="main">
        <nav aria-label="结果导航" className="journey-result__actions">
          <Button
            onClick={() => controller.navigate(state.resultReturn === "history" ? "history" : "home")}
            variant="secondary"
          >
            {state.resultReturn === "history" ? "返回历史记录" : "返回主页"}
          </Button>
          <Button onClick={() => controller.navigate("history")} variant="secondary">
            查看全部历史
          </Button>
        </nav>
        <LongCard input={state.displayedResult} reducedMotion={state.reducedMotion} />
      </main>
    );
  }

  if ((state.phase === "history" || state.phase === "about") && state.workspace) {
    return (
      <div className="journey-secondary">
        {state.message ? <p className="journey-message" role="status">{state.message}</p> : null}
        <HistoryAboutView
          initialTab={state.phase}
          key={state.phase}
          onNavigateHome={() => controller.navigate("home")}
          onOpenRecord={(record) => void controller.openHistoryRecord(record.record_id)}
          onRequestDeleteWorkspace={() => {
            if (window.confirm("确认删除当前匿名工作区及全部历史？此操作无法恢复。")) {
              void controller.deleteWorkspace();
            }
          }}
          onTabChange={(tab) => controller.navigate(tab)}
          reader={gateway}
          reduceMotion={state.reducedMotion}
          workspace={state.workspace}
          workspaceId={state.workspace.workspace_id}
        />
      </div>
    );
  }

  if (state.phase === "home" && state.workspace && state.draft) {
    return (
      <div className="journey-workspace">
        <p className="journey-source-banner" role="note">
          <DemoBadge />
          <span>{state.draft.source_label ?? "随机体验身份 · 示例数据（非实时）"}</span>
          {state.draftSaving ? <span>正在保存草稿…</span> : <span>草稿已绑定当前私密工作区</span>}
        </p>
        {state.message ? <p className="journey-message" role="status">{state.message}</p> : null}
        <WorkspaceShell
          activeAnalysis={state.activeAnalysis && !state.activeAnalysis.terminal
            ? { analysisId: state.activeAnalysis.analysisId }
            : undefined}
          draft={state.draft}
          lastAnalysisAt={state.lastAnalysisAt}
          latestCompleteTradingDay={latestCompleteTradingDay(state.draft)}
          onDraftChange={(draft) => controller.updateDraft(draft)}
          onNavigateAbout={() => controller.navigate("about")}
          onNavigateHistory={() => controller.navigate("history")}
          onReducedMotionChange={(enabled) => controller.setReducedMotion(enabled)}
          onResumeAnalysis={(analysisId) => void controller.resumeAnalysis(analysisId)}
          onStartAnalysis={() => void controller.startAnalysis(state.draft!)}
          reducedMotion={state.reducedMotion}
          workspace={state.workspace}
        />
      </div>
    );
  }

  return (
    <JourneyStatePage
      action={() => void controller.bootstrap()}
      actionLabel="重新读取工作区"
      heading="旅程状态不完整"
      message="为避免展示错配的草稿、任务或长笺，页面已停止并等待重新读取。"
    />
  );
}
