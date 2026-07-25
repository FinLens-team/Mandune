import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { ThemeId } from "../../theme/index.js";
import easterEggImage from "../../client/assets/developer-easter-egg.webp";
import { EASTER_EGG_AUDIO_THEMES, EasterEggAudioEngine } from "./easter-egg-audio.js";

const PITCH_LABELS = ["高音", "中音", "低音"] as const;

export interface AboutEasterEggGameProps {
  themeId: ThemeId;
}

export function AboutEasterEggGame({ themeId }: AboutEasterEggGameProps) {
  const engineRef = useRef<EasterEggAudioEngine | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ active: false, cell: -1 });
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [audioState, setAudioState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const audioTheme = EASTER_EGG_AUDIO_THEMES[themeId];

  useEffect(() => {
    const engine = new EasterEggAudioEngine(themeId);
    engineRef.current = engine;
    setAudioState("idle");
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      for (const timer of visualTimersRef.current) clearTimeout(timer);
      visualTimersRef.current.clear();
      pulseTimerRef.current = null;
      engineRef.current = null;
      void engine.stop();
    };
  }, [themeId]);

  function pulse(cellIndex: number) {
    setActiveCell(cellIndex);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setActiveCell(null), 260);
  }

  function play(cellIndex: number) {
    if (audioState === "idle") setAudioState("loading");
    const engine = engineRef.current;
    void engine?.trigger(cellIndex).then((waitMs) => {
      if (engineRef.current !== engine || waitMs === null) return;
      setAudioState("ready");
      const timer = setTimeout(() => {
        visualTimersRef.current.delete(timer);
        pulse(cellIndex);
      }, waitMs);
      visualTimersRef.current.add(timer);
    }).catch(() => {
      if (engineRef.current !== engine) return;
      setAudioState("error");
    });
  }

  function cellAtPointer(event: PointerEvent<HTMLDivElement>): number | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const bounds = grid.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) return null;
    const column = Math.min(2, Math.floor(x / bounds.width * 3));
    const row = Math.min(2, Math.floor(y / bounds.height * 3));
    return row * 3 + column;
  }

  function beginPointer(cellIndex: number, event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { active: true, cell: cellIndex };
    play(cellIndex);
  }

  function movePointer(event: PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current.active) return;
    const cellIndex = cellAtPointer(event);
    if (cellIndex === null || cellIndex === pointerRef.current.cell) return;
    pointerRef.current.cell = cellIndex;
    play(cellIndex);
  }

  function endPointer() {
    pointerRef.current = { active: false, cell: -1 };
  }

  return (
    <div className="about-easter-game">
      <div className="about-easter-game__meta">
        <p>不同主题音效不一样哦</p>
        <span>当前音效 · {audioTheme.label}</span>
      </div>
      <div
        aria-label={`${audioTheme.label}九宫格节奏乐器`}
        className="about-easter-game__grid"
        onPointerCancel={endPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        ref={gridRef}
        role="group"
      >
        {Array.from({ length: 9 }, (_, cellIndex) => {
          const row = Math.floor(cellIndex / 3);
          const column = cellIndex % 3;
          const definition = audioTheme.samples[column]!;
          return (
            <button
              aria-label={`${audioTheme.label} ${definition.label} ${PITCH_LABELS[row]}`}
              className={activeCell === cellIndex ? "is-active" : undefined}
              key={cellIndex}
              onClick={(event) => {
                if (event.detail === 0) play(cellIndex);
              }}
              onPointerDown={(event) => beginPointer(cellIndex, event)}
              style={{
                "--tile-image": `url(${easterEggImage})`,
                "--tile-x": `${column * 50}%`,
                "--tile-y": `${row * 50}%`,
              } as CSSProperties}
              type="button"
            >
              <span aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="about-easter-game__footer">
        <span aria-live="polite">
          {audioState === "loading"
            ? "正在加载音效…"
            : audioState === "error"
              ? "音效加载失败，请关闭彩蛋后重试"
              : "点击或拖过图片开始演奏"}
        </span>
        <a href="https://github.com/MarkCup-Official/Dagou-Tap-New" rel="noreferrer" target="_blank">
          音效与玩法改编自 MarkCup《大狗 Tap》
        </a>
      </div>
    </div>
  );
}
