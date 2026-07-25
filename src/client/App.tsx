import { useEffect, useReducer, useRef, useState } from "react";
import {
  FetchJourneyGateway,
  JourneyController,
  createJourneyPersistence,
  getBrowserJourneyStorage,
  initialJourneyState,
  journeyReducer,
  type AtlasGateway,
  type JourneyGateway,
  type JourneyPersistence,
} from "../app/client/index.js";
import { BrandBanner, Button } from "./ui/index.js";
import { AboutView } from "../features/about/index.js";
import { AnalysisProgress } from "../features/analysis-progress/index.js";
import { HistoryView } from "../features/history-view/index.js";
import { AtlasReveal, AtlasView } from "../features/atlas/index.js";
import { LongCard } from "../features/long-card/LongCard.js";
import { OnboardingFlow } from "../features/onboarding/index.js";
import { ThemeSwitcher } from "../features/theme-switcher/index.js";
import { WorkspaceNav, WorkspaceShell } from "../features/workspace-shell/index.js";
import "../app/client/styles.css";

export interface AppProps {
  gateway?: JourneyGateway;
  atlasGateway?: AtlasGateway;
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
  const atlasGatewayRef = useRef<AtlasGateway | null>(null);
  const persistenceRef = useRef<JourneyPersistence | null>(null);
  const controllerRef = useRef<JourneyController | null>(null);

  if (!gatewayRef.current) {
    const gateway = props.gateway ?? new FetchJourneyGateway();
    gatewayRef.current = gateway;
    atlasGatewayRef.current = props.atlasGateway ?? (
      "getAtlasOutcome" in gateway && "listAtlasCards" in gateway
        ? gateway as JourneyGateway & AtlasGateway
        : null
    );
  }
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
  return [state, controllerRef.current, gatewayRef.current, atlasGatewayRef.current] as const;
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
    <div className="journey-state-page">
      <BrandBanner />
      <main className="journey-state" id="main" role="status">
        <h1 tabIndex={-1}>{heading}</h1>
        <p>{message}</p>
        <Button onClick={action} variant="primary">{actionLabel}</Button>
      </main>
    </div>
  );
}

export function App(props: AppProps = {}) {
  const [state, controller, gateway, atlasGateway] = useJourney(props);
  const bootStarted = useRef(false);
  // Drawer-selected home entry view: 数据管理 from a secondary page
  // mounts WorkspaceShell directly on the portfolio view.
  const [homeEntryView, setHomeEntryView] = useState<"home" | "portfolio">("home");
  const streamingAnalysisId = state.phase === "analysis" && !state.activeAnalysis?.terminal
    ? state.activeAnalysis?.analysisId
    : undefined;

  function goHome(view: "home" | "portfolio") {
    setHomeEntryView(view);
    controller.navigate("home");
  }

  function workspaceNav(currentPage: "analysis" | "result" | "history" | "atlas" | "theme" | "about") {
    return (
      <WorkspaceNav
        currentPage={currentPage}
        onNavigateAbout={() => controller.navigate("about")}
        onNavigateAtlas={atlasGateway ? () => controller.navigate("atlas") : undefined}
        onNavigateHistory={() => controller.navigate("history")}
        onNavigateTheme={() => controller.navigate("theme")}
        onNavigateHome={() => goHome("home")}
        onNavigatePortfolio={() => goHome("portfolio")}
        reduceMotion={state.reducedMotion}
      />
    );
  }

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

  useEffect(() => {
    if (!streamingAnalysisId || !gateway.subscribeAnalysisStream) return;
    return gateway.subscribeAnalysisStream(streamingAnalysisId, (text) => {
      controller.applyStreamText(streamingAnalysisId, text);
    });
  }, [controller, gateway, streamingAnalysisId]);

  useEffect(() => {
    if (state.phase === "booting" || state.phase === "onboarding") return;
    const frame = window.requestAnimationFrame(() => {
      const selector = state.phase === "result"
        ? ".mandong-long-card__front h2"
        : state.phase === "analysis"
          ? "#analysis-progress-heading"
          : state.phase === "home"
            ? "#workspace-home-heading"
            : state.phase === "history"
              ? "#history-list-heading, #history-empty-heading"
               : state.phase === "about"
                 ? "#about-heading"
                : state.phase === "theme"
                  ? "#theme-switcher-heading"
                 : ".journey-state h1";
      document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state.phase]);

  // While booting, render nothing (bootstrap is near-instant).
  if (state.phase === "booting") {
    return null;
  }

  if (state.phase === "workspace_error") {
    return (
      <JourneyStatePage
        action={() => void controller.bootstrap()}
        actionLabel="重试"
        heading="后端服务出现异常"
        message="请联系开发者"
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
        initialThemeId={state.currentThemeId}
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
          onOpenResult={() => controller.openCurrentResult()}
          onRetry={() => state.draft && void controller.startAnalysis(state.draft)}
          reduceMotion={state.reducedMotion}
          streamText={state.activeAnalysis.streamText}
          terminal={state.activeAnalysis.terminal}
          themeId={state.activeAnalysis.themeId}
        />
        {workspaceNav("analysis")}
      </div>
    );
  }

  if (state.phase === "result" && state.displayedResult) {
    return (
      <div className="journey-result-page" data-reduced-motion={state.reducedMotion || undefined}>
        <BrandBanner />
        <main className="journey-result" id="main">
          <LongCard input={state.displayedResult} reducedMotion={state.reducedMotion} />
          {atlasGateway ? (
            <AtlasReveal
              analysisId={state.displayedResult.analysis.analysis_id}
              gateway={atlasGateway}
              reducedMotion={state.reducedMotion}
              themeId={state.displayedResult.analysis.theme_id}
            />
          ) : null}
        </main>
        {workspaceNav("result")}
      </div>
    );
  }

  if (state.phase === "atlas" && state.workspace && atlasGateway) {
    return (
      <>
        <AtlasView
          gateway={atlasGateway}
          onOpenHistory={(recordId) => void controller.openHistoryRecord(recordId, "atlas")}
          reducedMotion={state.reducedMotion}
        />
        {workspaceNav("atlas")}
      </>
    );
  }

  if (state.phase === "history" && state.workspace) {
    return (
      <div className="journey-secondary">
        <BrandBanner />
        {state.message ? <p className="journey-message" role="status">{state.message}</p> : null}
        <main className="journey-secondary__page" id="main">
          <HistoryView
            onOpenRecord={(record) => void controller.openHistoryRecord(record.record_id)}
            reader={gateway}
            reduceMotion={state.reducedMotion}
            workspaceId={state.workspace.workspace_id}
          />
        </main>
        {workspaceNav("history")}
      </div>
    );
  }

  if (state.phase === "about" && state.workspace) {
    return (
      <div className="journey-secondary">
        <BrandBanner />
        {state.message ? <p className="journey-message" role="status">{state.message}</p> : null}
        <main className="journey-secondary__page" id="main">
          <AboutView
            experienceSource={state.experienceSource}
            onRequestDeleteWorkspace={() => {
              if (window.confirm("确认注销当前工作区数据及全部历史？此操作无法恢复。")) {
                void controller.deleteWorkspace();
              }
            }}
            themeId={state.currentThemeId}
            workspace={state.workspace}
          />
        </main>
        {workspaceNav("about")}
      </div>
    );
  }

  if (state.phase === "theme" && state.workspace) {
    return (
      <div className="journey-secondary">
        <BrandBanner />
        <main className="journey-secondary__page" id="main">
          <ThemeSwitcher
            currentThemeId={state.currentThemeId}
            onConfirm={(themeId) => {
              controller.setTheme(themeId);
              goHome("home");
            }}
            reducedMotion={state.reducedMotion}
          />
        </main>
        {workspaceNav("theme")}
      </div>
    );
  }

  if (state.phase === "home" && state.workspace && state.draft) {
    return (
      <div className="journey-workspace">
        {state.message ? <p className="journey-message" role="status">{state.message}</p> : null}
        <WorkspaceShell
          activeAnalysis={state.activeAnalysis && !state.activeAnalysis.terminal
            ? { analysisId: state.activeAnalysis.analysisId }
            : undefined}
          draft={state.draft}
          themeId={state.currentThemeId}
          experienceSource={state.experienceSource}
          lastAnalysisAt={state.lastAnalysisAt}
          initialView={homeEntryView}
          latestCompleteTradingDay={latestCompleteTradingDay(state.draft)}
          onDraftChange={(draft) => controller.updateDraft(draft)}
          onExperienceSourceChange={(source) => controller.setExperienceSource(source)}
          onNavigateAbout={() => controller.navigate("about")}
          onNavigateHistory={() => controller.navigate("history")}
          onNavigateTheme={() => controller.navigate("theme")}
          onNavigateAtlas={atlasGateway ? () => controller.navigate("atlas") : undefined}
          onReducedMotionChange={(enabled) => controller.setReducedMotion(enabled)}
          onReviewCoachmarkDismiss={() => controller.dismissReviewCoachmark()}
          onResumeAnalysis={(analysisId) => void controller.resumeAnalysis(analysisId)}
          onStartAnalysis={() =>
            void controller.startAnalysis(state.draft!, state.experienceSource)}
          reducedMotion={state.reducedMotion}
          reviewCoachmarkVisible={state.reviewCoachmarkVisible}
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
      message="为避免展示错配的草稿、任务或复盘报告，页面已停止并等待重新读取。"
    />
  );
}
