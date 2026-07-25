import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AnalysisResultStatus, TaskEvent } from "../../contracts/index.js";
import { AnalysisStatus, BrandBanner, Button } from "../../client/ui/index.js";
import nailongPop from "../../client/assets/mascot/nailong-pop.webp";
import nailongRest from "../../client/assets/mascot/nailong-rest.webp";
import {
  projectAnalysisProgress,
  streamHeadingMessages,
  type AnalysisConnectionState,
  type AnalysisProgressTerminal,
} from "./projection.js";
import "./styles.css";

/** 83 frames at 24fps (~3.5s) plus a small buffer before swapping to the rest pose. */
const MASCOT_POP_DURATION_MS = 3650;
const MASCOT_POP_STORAGE_PREFIX = "mandong.analysis-mascot-pop.";

function hasPlayedMascotPop(analysisId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(`${MASCOT_POP_STORAGE_PREFIX}${analysisId}`) === "1";
  } catch {
    return false;
  }
}

function markMascotPopPlayed(analysisId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${MASCOT_POP_STORAGE_PREFIX}${analysisId}`, "1");
  } catch {
    // Storage is optional; the animation stays a non-essential extra.
  }
}

export interface AnalysisProgressProps {
  analysisId: string;
  connection: AnalysisConnectionState;
  events: readonly TaskEvent[];
  onLeave?: () => void;
  onNavigateHome?: () => void;
  onOpenResult?: (status: Exclude<AnalysisResultStatus, "unavailable">) => void;
  onRetry?: () => void;
  reduceMotion?: boolean;
  streamText?: string;
  terminal?: AnalysisProgressTerminal;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

/** Elapsed wall-clock seconds between the first real event and now (or the last event at terminal). */
function useElapsedSeconds(
  startIso: string | undefined,
  endIso: string | undefined,
  ticking: boolean,
): number | undefined {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  if (!startIso) return undefined;
  const end = endIso ? Date.parse(endIso) : now;
  return Math.max(0, Math.floor((end - Date.parse(startIso)) / 1_000));
}

export function AnalysisProgress({
  analysisId,
  connection,
  events,
  onLeave,
  onNavigateHome,
  onOpenResult,
  onRetry,
  reduceMotion = false,
  streamText,
  terminal,
}: AnalysisProgressProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const model = projectAnalysisProgress({ analysisId, connection, events, terminal });
  const [showPop, setShowPop] = useState(false);
  // Terminal state at mount time only: a result arriving mid-playback
  // must not re-run the effect and cut the animation short.
  const terminalAtMountRef = useRef(model.isTerminal);

  const ownEvents = events.filter((event) => event.analysis_id === analysisId);
  const elapsedSeconds = useElapsedSeconds(
    ownEvents[0]?.occurred_at,
    model.isTerminal ? ownEvents.at(-1)?.occurred_at : undefined,
    !model.isTerminal && ownEvents.length > 0,
  );
  const stepIndex = model.stages.findIndex((stage) => stage.isCurrent) + 1;
  const title = model.terminal
    ? model.terminal.status === "unavailable"
      ? "本次复盘未完成"
      : "今日复盘完成"
    : "复盘进行中";
  const stepLabel = model.isTerminal
    ? elapsedSeconds === undefined
      ? "今日复盘"
      : `今日复盘 · 用时 ${formatElapsed(elapsedSeconds)}`
    : stepIndex > 0 && elapsedSeconds !== undefined
      ? `今日复盘 · 第 ${stepIndex}/${model.stages.length} 步 · 已进行 ${formatElapsed(elapsedSeconds)}`
      : "今日复盘 · 正在连接任务";
  const lede = model.terminal
    ? model.terminal.status === "unavailable"
      ? "本次没有生成可展示的完整报告，具体原因见下方说明。"
      : "结论与证据边界已冻结存档，可随时查看报告。"
    : "满懂正在核对市场数据与可核验证据，进度只随真实任务事件更新。";
  const mascotIdle = !showPop && !model.isTerminal && !reduceMotion;
  const visibleLogLines = [
    ...model.logLines.map((line) => ({ id: line.id, text: line.text })),
    ...streamHeadingMessages(streamText).map((text) => ({ id: `stream:${text}`, text })),
  ]
    .filter((line, index, lines) => lines.findIndex((candidate) => candidate.text === line.text) === index)
    .slice(-3);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Play the pop-in action once per analysis, only after the animation
  // asset has fully decoded; any failure keeps the static rest pose.
  useEffect(() => {
    if (reduceMotion || terminalAtMountRef.current || hasPlayedMascotPop(analysisId)) {
      setShowPop(false);
      return;
    }

    let cancelled = false;
    let started = false;
    let timer: number | undefined;
    const image = new Image();

    function startPop() {
      if (cancelled || started) return;
      started = true;
      setShowPop(true);
      // Mark as played only after a full playback so StrictMode's
      // dev-mode double effect run cannot swallow the animation.
      timer = window.setTimeout(() => {
        markMascotPopPlayed(analysisId);
        setShowPop(false);
      }, MASCOT_POP_DURATION_MS);
    }

    image.decoding = "async";
    image.onload = startPop;
    image.onerror = () => setShowPop(false);
    image.src = nailongPop;
    if (image.complete && image.naturalWidth > 0) startPop();

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [analysisId, reduceMotion]);

  return (
    <div
      className="analysis-progress"
      data-phase={model.phase}
      data-reduce-motion={reduceMotion || undefined}
    >
      <BrandBanner />
      <main aria-labelledby="analysis-progress-heading" className="analysis-progress__main">
        <header className="analysis-progress__heading">
          <p className="analysis-progress__step">{stepLabel}</p>
          <h1
            className="analysis-progress__title"
            id="analysis-progress-heading"
            ref={headingRef}
            tabIndex={-1}
          >
            {title}
          </h1>
          <p className="analysis-progress__lede">{lede}</p>
        </header>

        <section aria-label="任务进度" className="analysis-progress__panel">
          <div aria-hidden="true" className="analysis-progress__steps">
            {model.stages.map((stage) => (
              <span
                data-state={
                  stage.isCurrent && !model.isTerminal
                    ? "current"
                    : stage.state === "succeeded"
                      ? "done"
                      : ["failed", "cancelled", "timed_out"].includes(stage.state)
                        ? "halted"
                        : "pending"
                }
                key={stage.stage}
              />
            ))}
          </div>

          <div className="analysis-progress__stage" data-idle={mascotIdle || undefined}>
            <img
              alt=""
              className="analysis-progress__mascot"
              decoding="async"
              height="512"
              onError={() => setShowPop(false)}
              src={showPop ? nailongPop : nailongRest}
              width="512"
            />
          </div>

          <ol aria-live="polite" className="analysis-progress__log" role="log">
            {visibleLogLines.length === 0 ? (
              <li className="analysis-progress__log-line" data-placeholder="true">
                {model.currentMessage}
              </li>
            ) : (
              visibleLogLines.map((line, index) => (
                <li
                  className="analysis-progress__log-line"
                  data-latest={index === visibleLogLines.length - 1 || undefined}
                  key={line.id}
                >
                  {line.text}
                </li>
              ))
            )}
          </ol>

          {connection === "disconnected" || connection === "reconnecting" ? (
            <p className="analysis-progress__connection" role="status">
              {model.connectionLabel}，已收到的阶段不会丢失。
            </p>
          ) : null}
        </section>

        {model.terminal ? (
          <div className="analysis-progress__ending">
            <AnalysisStatus
              className="analysis-progress__outcome"
              description={model.terminal.reason}
              status={model.terminal.status}
            />
            <div className="analysis-progress__actions">
              {model.canOpenResult && onOpenResult ? (
                <Button
                  onClick={() =>
                    onOpenResult(
                      model.terminal!.status as Exclude<AnalysisResultStatus, "unavailable">,
                    )
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
              {onNavigateHome ? (
                <Button onClick={onNavigateHome} variant="secondary">
                  返回主页
                </Button>
              ) : null}
            </div>
          </div>
        ) : onLeave ? (
          <div className="analysis-progress__actions analysis-progress__actions--running">
            <Button onClick={onLeave} variant="secondary">
              暂时离开
            </Button>
            <p className="analysis-progress__leave-note">任务不会取消，返回后继续同一进度。</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
