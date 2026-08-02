import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AnalysisResultStatus, TaskEvent } from "../../contracts/index.js";
import { AnalysisStatus, BrandBanner, Button } from "../../client/ui/index.js";
import { playWaitingMascotMusic } from "../../client/audio/waiting-mascot-music.js";
import { themeForId, type ThemeId } from "../../theme/index.js";
import { themeClientAssets, themeCssVariables } from "../../theme/client.js";
import { FALLBACK_DAILY_BRIEFING, loadDailyBriefing } from "./daily-briefing.js";
import {
  projectAnalysisProgress,
  streamHeadingMessages,
  type AnalysisConnectionState,
  type AnalysisProgressTerminal,
} from "./projection.js";
import "./styles.css";

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
  onOpenResult?: (status: Exclude<AnalysisResultStatus, "unavailable">) => void;
  onRetry?: () => void;
  reduceMotion?: boolean;
  streamText?: string;
  terminal?: AnalysisProgressTerminal;
  themeId?: ThemeId;
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
  onOpenResult,
  onRetry,
  reduceMotion = false,
  streamText,
  terminal,
  themeId = "eastern_observation",
}: AnalysisProgressProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const initialMusicAnalysisRef = useRef<string | null>(null);
  const model = projectAnalysisProgress({ analysisId, connection, events, terminal });
  const [showPop, setShowPop] = useState(false);
  const theme = themeForId(themeId);
  const assets = themeClientAssets(themeId);
  const [dailyBriefing, setDailyBriefing] = useState({ ...FALLBACK_DAILY_BRIEFING, theme_id: themeId });
  useEffect(() => {
    const controller = new AbortController();
    void loadDailyBriefing(themeId, controller.signal).then(setDailyBriefing);
    return () => controller.abort();
  }, [themeId]);
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
  const streamedHeadings = streamHeadingMessages(streamText);
  const generationMessages = [
    ...ownEvents
    .filter((event) =>
      event.stage === "form_conclusions_and_advice" && event.message !== undefined
    )
    .map((event) => event.message!),
    ...streamedHeadings,
  ]
    .filter((text, index, lines) => lines.indexOf(text) === index);
  const visibleLogLines = generationMessages.length > 0
    ? generationMessages.slice(-8).map((text) => ({
        id: `generation:${text}`,
        kind: "generation" as const,
        text,
      }))
    : model.logLines.map((line) => ({ id: line.id, kind: "event" as const, text: line.text }))
        .slice(-8);

  function playInitialMascotMusic() {
    if (themeId !== "eastern_observation") return;
    if (initialMusicAnalysisRef.current === analysisId) return;
    initialMusicAnalysisRef.current = analysisId;
    void playWaitingMascotMusic();
  }

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Play the pop-in action once per analysis, only after the animation
  // asset has fully decoded; any failure keeps the static rest pose.
  useEffect(() => {
    const animation = assets.progressAnimation;
    if (!animation || reduceMotion || terminalAtMountRef.current || hasPlayedMascotPop(analysisId)) {
      setShowPop(false);
      return;
    }

    if (animation.kind === "video") {
      playInitialMascotMusic();
      setShowPop(true);
      return () => setShowPop(false);
    }
    const imageAnimation = animation;

    let cancelled = false;
    let started = false;
    let timer: number | undefined;
    const image = new Image();

    function startPop() {
      if (cancelled || started) return;
      started = true;
      playInitialMascotMusic();
      setShowPop(true);
      // Mark as played only after a full playback so StrictMode's
      // dev-mode double effect run cannot swallow the animation.
      timer = window.setTimeout(() => {
        markMascotPopPlayed(analysisId);
        setShowPop(false);
      }, imageAnimation.durationMs);
    }

    image.decoding = "async";
    image.onload = startPop;
    image.onerror = () => setShowPop(false);
    image.src = imageAnimation.src;
    if (image.complete && image.naturalWidth > 0) startPop();

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [analysisId, assets.progressAnimation, reduceMotion]);

  return (
    <div
      className="analysis-progress"
      data-theme={theme.id}
      data-phase={model.phase}
      data-reduce-motion={reduceMotion || undefined}
      style={themeCssVariables(theme.id)}
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

          <button
            aria-label={`点击${theme.mascot.name}播放音乐`}
            className="analysis-progress__stage"
            data-idle={mascotIdle || undefined}
            onClick={() => {
              if (themeId === "eastern_observation") void playWaitingMascotMusic();
            }}
            type="button"
          >
            {showPop && assets.progressAnimation?.kind === "video" ? (
              <video
                autoPlay
                className="analysis-progress__mascot"
                height="720"
                muted
                onEnded={() => {
                  markMascotPopPlayed(analysisId);
                  setShowPop(false);
                }}
                onError={() => setShowPop(false)}
                playsInline
                poster={assets.rest.src}
                src={assets.progressAnimation.src}
                width="720"
              />
            ) : (
              <img
                alt=""
                className="analysis-progress__mascot"
                decoding="async"
                height={assets.rest.height}
                onError={() => setShowPop(false)}
                src={showPop && assets.progressAnimation?.kind === "image"
                  ? assets.progressAnimation.src
                  : assets.rest.src}
                width={assets.rest.width}
              />
            )}
          </button>

          <ol aria-live="polite" className="analysis-progress__log" role="log">
            {visibleLogLines.length === 0 ? (
              <li className="analysis-progress__log-line" data-placeholder="true">
                {model.currentMessage}
              </li>
            ) : (
              visibleLogLines.map((line, index) => (
                <li
                  className="analysis-progress__log-line"
                  data-kind={line.kind}
                  data-latest={index === visibleLogLines.length - 1 || undefined}
                  key={line.id}
                >
                  {line.text}
                </li>
              ))
            )}
          </ol>

          {!model.isTerminal ? (
            <article aria-labelledby="analysis-daily-briefing-title" className="analysis-progress__daily-message">
              <header>
                <p className="analysis-progress__daily-label">满懂日报 · {dailyBriefing.date || "今日"}</p>
                <h2 id="analysis-daily-briefing-title">{dailyBriefing.title}</h2>
                <p className="analysis-progress__daily-dek">{dailyBriefing.dek}</p>
              </header>
              {dailyBriefing.market.length > 0 ? (
                <section className="analysis-progress__daily-market" aria-labelledby="analysis-daily-market-title">
                  <h3 id="analysis-daily-market-title">今日市场</h3>
                  <dl>
                    {dailyBriefing.market.map((item) => (
                      <div key={`${item.label}:${item.observed_at}`}>
                        <dt>{item.label}</dt>
                        <dd>
                          <strong>{item.value}</strong>
                          {item.change ? <span>{item.change}</span> : null}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
              {dailyBriefing.news.length > 0 ? (
                <section className="analysis-progress__daily-news" aria-labelledby="analysis-daily-news-title">
                  <h3 id="analysis-daily-news-title">值得关注</h3>
                  <ol>
                    {dailyBriefing.news.map((item) => {
                      const source = dailyBriefing.sources.find((entry) => entry.id === item.source_id);
                      return (
                        <li key={`${item.title}:${item.published_at}`}>
                          <h4>{item.title}</h4>
                          <p>{item.summary}</p>
                          <small>
                            {item.published_at} · {source ? (
                              <a href={source.url} rel="noreferrer" target="_blank">{source.name}</a>
                            ) : item.source_id}
                          </small>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ) : null}
              <div className="analysis-progress__daily-sections">
                {dailyBriefing.sections.map((section) => (
                  <section key={section.heading}>
                    <h3>{section.heading}</h3>
                    <p>{section.body}</p>
                  </section>
                ))}
              </div>
              <footer>
                <span>行情截止：{dailyBriefing.market_data_cutoff}</span>
                <p>{dailyBriefing.notice}</p>
              </footer>
            </article>
          ) : null}

          {connection === "disconnected" || connection === "reconnecting" ? (
            <p className="analysis-progress__connection" role="status">
              {model.connectionLabel}，已收到的阶段不会丢失。
            </p>
          ) : null}
        </section>

        {model.terminal ? (
          <div className="analysis-progress__ending">
            {model.terminal.status !== "limited" ? (
              <AnalysisStatus
                className="analysis-progress__outcome"
                description={model.terminal.reason}
                status={model.terminal.status}
              />
            ) : null}
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
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
