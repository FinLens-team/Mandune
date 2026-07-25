import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock3,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AnalysisResultStatus, TaskEvent } from "../../contracts/index.js";
import { AnalysisStatus, Button } from "../../client/ui/index.js";
import nailongIntro from "../../client/assets/mascot/nailong-intro.webp";
import nailongRest from "../../client/assets/mascot/nailong-rest.webp";
import {
  projectAnalysisProgress,
  shouldAnimateAnalysisProgress,
  type AnalysisConnectionState,
  type AnalysisProgressStageState,
  type AnalysisProgressTerminal,
} from "./projection.js";
import "./styles.css";

const MASCOT_INTRO_DURATION_MS = 4200;
const MASCOT_INTRO_STORAGE_PREFIX = "mandong.analysis-mascot-intro.";

function hasPlayedMascotIntro(analysisId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(`${MASCOT_INTRO_STORAGE_PREFIX}${analysisId}`) === "1";
  } catch {
    return false;
  }
}

function markMascotIntroPlayed(analysisId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${MASCOT_INTRO_STORAGE_PREFIX}${analysisId}`, "1");
  } catch {
    // Storage is optional; the visual remains non-essential when unavailable.
  }
}

export interface AnalysisProgressProps {
  analysisId: string;
  connection: AnalysisConnectionState;
  events: readonly TaskEvent[];
  onLeave?: () => void;
  onOpenResult?: (status: Exclude<AnalysisResultStatus, "unavailable">) => void;
  onRetry?: () => void;
  reduceMotion?: boolean;
  terminal?: AnalysisProgressTerminal;
}

function useAnalysisAnimationActive(
  rootRef: React.RefObject<HTMLElement | null>,
  connection: AnalysisConnectionState,
  isTerminal: boolean,
  phase: ReturnType<typeof projectAnalysisProgress>["phase"],
  reduceMotion: boolean,
) {
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [inViewport, setInViewport] = useState(true);

  useEffect(() => {
    function onVisibilityChange() {
      setPageVisible(document.visibilityState !== "hidden");
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {
      setInViewport(entry?.isIntersecting ?? false);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);

  return shouldAnimateAnalysisProgress({
    connection,
    inViewport,
    isTerminal,
    pageVisible,
    phase,
    reduceMotion,
  });
}

function StageIcon({ state }: { state: AnalysisProgressStageState }) {
  if (state === "succeeded") return <CircleCheck aria-hidden="true" size={20} />;
  if (state === "failed" || state === "cancelled") return <CircleX aria-hidden="true" size={20} />;
  if (state === "timed_out") return <Clock3 aria-hidden="true" size={20} />;
  if (state === "retrying") return <RefreshCw aria-hidden="true" size={20} />;
  return <CircleDashed aria-hidden="true" size={20} />;
}

function ConnectionIcon({ connection }: { connection: AnalysisConnectionState }) {
  return connection === "connected" || connection === "recovered" ? (
    <Wifi aria-hidden="true" size={20} />
  ) : (
    <WifiOff aria-hidden="true" size={20} />
  );
}

export function AnalysisProgress({
  analysisId,
  connection,
  events,
  onLeave,
  onOpenResult,
  onRetry,
  reduceMotion = false,
  terminal,
}: AnalysisProgressProps) {
  const rootRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const model = projectAnalysisProgress({ analysisId, connection, events, terminal });
  const animationActive = useAnalysisAnimationActive(
    rootRef,
    connection,
    model.isTerminal,
    model.phase,
    reduceMotion,
  );
  const [showMascotIntro, setShowMascotIntro] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!animationActive || reduceMotion || model.isTerminal || hasPlayedMascotIntro(analysisId)) {
      setShowMascotIntro(false);
      return;
    }

    let cancelled = false;
    let started = false;
    let timer: number | undefined;
    const image = new Image();

    function startIntro() {
      if (cancelled || started) return;
      started = true;
      markMascotIntroPlayed(analysisId);
      setShowMascotIntro(true);
      timer = window.setTimeout(() => setShowMascotIntro(false), MASCOT_INTRO_DURATION_MS);
    }

    image.decoding = "async";
    image.onload = startIntro;
    image.onerror = () => setShowMascotIntro(false);
    image.src = nailongIntro;
    if (image.complete && image.naturalWidth > 0) startIntro();

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [analysisId, animationActive, model.isTerminal, reduceMotion]);

  return (
    <main
      aria-labelledby="analysis-progress-heading"
      className="analysis-progress"
      data-animation-active={animationActive}
      data-mascot-intro={showMascotIntro || undefined}
      data-phase={model.phase}
      data-reduce-motion={reduceMotion || undefined}
      ref={rootRef}
    >
      <section className="analysis-progress__hero" aria-labelledby="analysis-progress-heading">
        <div aria-hidden="true" className="analysis-progress__orbit" />
        <div aria-hidden="true" className="analysis-progress__signal-bars">
          <span />
          <span />
          <span />
        </div>

        <header className="analysis-progress__header">
          <p className="analysis-progress__eyebrow">单个分析 agent</p>
          <h1 id="analysis-progress-heading" ref={headingRef} tabIndex={-1}>
            正在核对本次复盘
          </h1>
        </header>

        <p className="analysis-progress__connection" data-connection={connection}>
          <ConnectionIcon connection={connection} />
          <span>
            <strong>{model.connectionLabel}</strong>
            {connection === "disconnected" || connection === "reconnecting"
              ? "，已收到的阶段不会丢失"
              : "，阶段只随真实任务事件更新"}
          </span>
        </p>

        <section className="analysis-progress__current" aria-labelledby="analysis-current-heading">
          <h2 className="analysis-progress__section-title" id="analysis-current-heading">
            当前状态
          </h2>
          <div className="analysis-progress__scene">
            <img
              alt=""
              className="analysis-progress__mascot"
              decoding="async"
              height="512"
              onError={() => setShowMascotIntro(false)}
              src={showMascotIntro ? nailongIntro : nailongRest}
              width="512"
            />
            <p
              aria-atomic="true"
              aria-live="polite"
              className="analysis-progress__bubble"
              data-event-id={model.latestEventId}
              key={model.latestEventId ?? "no-event"}
              role="status"
            >
              {model.currentMessage}
            </p>
          </div>
          {model.coveredCount === undefined ? null : (
            <p className="analysis-progress__coverage">
              真实事件报告已覆盖 {model.coveredCount} 项持仓
            </p>
          )}
        </section>
      </section>

      {model.terminal ? (
        <AnalysisStatus
          className="analysis-progress__terminal"
          description={model.terminal.reason}
          status={model.terminal.status}
        />
      ) : null}

      <section className="analysis-progress__history" aria-labelledby="analysis-history-heading">
        <div className="analysis-progress__history-heading">
          <div>
            <p className="analysis-progress__eyebrow">纯文字等价路径</p>
            <h2 id="analysis-history-heading">完整阶段列表</h2>
          </div>
          <p>可离开后返回；已完成阶段不重播。</p>
        </div>
        <ol className="analysis-progress__stages">
          {model.stages.map((item) => (
            <li
              aria-current={item.isCurrent ? "step" : undefined}
              data-stage={item.stage}
              data-state={item.state}
              key={item.stage}
            >
              <span className="analysis-progress__stage-icon">
                <StageIcon state={item.state} />
              </span>
              <div className="analysis-progress__stage-copy">
                <h3>{item.label}</h3>
                <p>{item.stateLabel}</p>
                {item.detail ? <p>{item.detail}</p> : null}
                {item.retryCount === undefined ? null : <p>第 {item.retryCount} 次有限重试</p>}
                {item.coveredCount === undefined ? null : <p>已覆盖 {item.coveredCount} 项持仓</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="analysis-progress__actions">
        {model.canOpenResult && model.terminal && onOpenResult ? (
          <Button
            onClick={() =>
              onOpenResult(model.terminal!.status as Exclude<AnalysisResultStatus, "unavailable">)
            }
            variant="primary"
          >
            查看复盘报告
          </Button>
        ) : null}
        {model.canRetry && onRetry ? (
          <Button onClick={onRetry} variant="secondary">
            <RefreshCw aria-hidden="true" size={20} />
            重试本次复盘
          </Button>
        ) : null}
        {!model.isTerminal && onLeave ? (
          <Button onClick={onLeave} variant="secondary">
            暂时离开
          </Button>
        ) : null}
      </div>
      {!model.isTerminal && onLeave ? (
        <p className="analysis-progress__leave-note">分析任务不会因此取消，返回后继续读取同一任务状态。</p>
      ) : null}
    </main>
  );
}
