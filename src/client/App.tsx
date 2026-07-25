import { useEffect, useReducer, useRef, useState } from "react";
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
import { Button, DemoBadge, GeneratedMarkdown } from "./ui/index.js";
import { HistoryAboutView } from "../features/history-view/index.js";
import { LongCard } from "../features/long-card/LongCard.js";
import { OnboardingFlow } from "../features/onboarding/index.js";
import { WorkspaceShell } from "../features/workspace-shell/index.js";
import doudouObserver from "./assets/doudou/doudou-observer.png";
import previewOne from "./assets/theme-previews/theme-preview-1.png";
import previewTwo from "./assets/theme-previews/theme-preview-2.png";
import previewThree from "./assets/theme-previews/theme-preview-3.png";
import "../app/client/styles.css";

/** Static assets used by the fixed pages right after the splash. */
const SPLASH_PRELOAD_ASSETS = [doudouObserver, previewOne, previewTwo, previewThree] as const;

/** Splash stays up at least this long so the animation reads as intentional. */
const SPLASH_MIN_VISIBLE_MS = 1_200;

/** Never hold entry hostage to slow asset downloads. */
const SPLASH_PRELOAD_CAP_MS = 2_500;

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });
}

export interface AppProps {
  gateway?: JourneyGateway;
  persistence?: JourneyPersistence;
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

function SplashScreen() {
  return (
    <main aria-live="polite" className="journey-splash" id="main" role="status">
      <img alt="" aria-hidden="true" className="journey-splash__mascot" src={doudouObserver} />
      <h1>满懂</h1>
      <p>正在准备匿名私密工作区与页面资源</p>
      <span aria-hidden="true" className="journey-splash__dots">
        <i /><i /><i />
      </span>
    </main>
  );
}

export function App(props: AppProps = {}) {
  const [state, controller, gateway] = useJourney(props);
  const bootStarted = useRef(false);
  // The splash is non-interactive: it holds until bootstrap finishes, the next
  // fixed pages' static assets are warmed, and a minimum animation beat passes.
  const [splashHolding, setSplashHolding] = useState(true);

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    void controller.bootstrap();
  }, [controller]);

  useEffect(() => {
    let cancelled = false;
    const minimumBeat = new Promise((resolve) => setTimeout(resolve, SPLASH_MIN_VISIBLE_MS));
    const preload = Promise.race([
      Promise.all(SPLASH_PRELOAD_ASSETS.map(preloadImage)),
      new Promise((resolve) => setTimeout(resolve, SPLASH_PRELOAD_CAP_MS)),
    ]);
    void Promise.all([minimumBeat, preload]).then(() => {
      if (!cancelled) setSplashHolding(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const active = state.activeAnalysis;
    if (state.phase !== "analysis" || !active || active.terminal) return;
    void controller.refreshAnalysis(active.analysisId);
    const poll = window.setInterval(() => {
      void controller.refreshAnalysis(active.analysisId);
    }, gateway.pollIntervalMs);
    return () => window.clearInterval(poll);
  }, [controller, gateway.pollIntervalMs, state.activeAnalysis, state.phase]);

  // Relaxed Demo mode: stream the model's free-text narrative while it runs.
  const streamAnalysisId =
    state.phase === "analysis" && state.activeAnalysis && !state.activeAnalysis.terminal
      ? state.activeAnalysis.analysisId
      : null;
  useEffect(() => {
    if (!streamAnalysisId || typeof EventSource === "undefined") return;
    const source = new EventSource(
      `/api/analyses/${encodeURIComponent(streamAnalysisId)}/stream`,
      { withCredentials: true },
    );
    source.addEventListener("delta", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { text?: unknown };
        // Deltas carry the full cumulative text: replace, never append.
        if (typeof data.text === "string") controller.applyStreamText(streamAnalysisId, data.text);
      } catch {
        // Ignore malformed frames; the persisted result stays the source of truth.
      }
    });
    source.addEventListener("done", () => source.close());
    return () => source.close();
  }, [controller, streamAnalysisId]);

  // Error, deletion and analysis states break out of the splash immediately;
  // only the normal entry pages wait for the animation-and-preload hold.
  const splashVisible =
    state.phase === "booting" ||
    (splashHolding && (state.phase === "onboarding" || state.phase === "home"));
  if (splashVisible) {
    return <SplashScreen />;
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
    const terminal = state.activeAnalysis.terminal;
    if (terminal) {
      // Displayable terminals open the long card directly; only honest degradation stays here.
      return (
        <JourneyStatePage
          action={() => controller.navigate("home")}
          actionLabel="返回主页"
          heading="本次复盘未能生成报告"
          message={terminal.reason ?? "当前证据不足，未生成复盘报告。"}
        />
      );
    }
    return (
      <main aria-live="polite" className="journey-state journey-state--streaming" id="main" role="status">
        <span className="journey-state__pulse" aria-hidden="true" />
        <h1>正在核对本次复盘</h1>
        {state.activeAnalysis.streamText?.trim() ? (
          <div className="journey-stream">
            <GeneratedMarkdown>{state.activeAnalysis.streamText}</GeneratedMarkdown>
          </div>
        ) : (
          <p>只随真实任务事件推进，完成后直接打开复盘报告。</p>
        )}
        <Button onClick={() => controller.leaveAnalysis()} variant="secondary">
          暂时离开，任务继续进行
        </Button>
      </main>
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
          {state.resultReturn === "home" && state.draft ? (
            <Button onClick={() => void controller.startAnalysis(state.draft!)} variant="secondary">
              刷新复盘
            </Button>
          ) : null}
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
          onDraftChange={(draft) => controller.updateDraft(draft)}
          onNavigateAbout={() => controller.navigate("about")}
          onNavigateHistory={() => controller.navigate("history")}
          onReducedMotionChange={(enabled) => controller.setReducedMotion(enabled)}
          onStartAnalysis={() => void controller.startToday(state.draft!)}
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
      message="为避免展示错配的草稿、任务或复盘报告，页面已停止并等待重新读取。"
    />
  );
}
