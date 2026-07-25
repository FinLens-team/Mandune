import { Check } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import { Button } from "../../client/ui/index.js";
import { THEMES, THEME_IDS, type ThemeId } from "../../theme/index.js";
import { themeClientAssets, themeCssVariables } from "../../theme/client.js";
import "./styles.css";

export interface ThemeSwitcherProps {
  currentThemeId: ThemeId;
  onConfirm: (themeId: ThemeId) => void;
  reducedMotion?: boolean;
}

export function ThemeSwitcher({
  currentThemeId,
  onConfirm,
  reducedMotion = false,
}: ThemeSwitcherProps) {
  const [selectedThemeId, setSelectedThemeId] = useState(currentThemeId);
  const railRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | undefined>(undefined);
  const canConfirm = selectedThemeId !== currentThemeId;

  useEffect(() => {
    const selected = railRef.current?.querySelector<HTMLElement>(
      `[data-theme-card="${currentThemeId}"]`,
    );
    selected?.scrollIntoView({
      behavior: "instant",
      block: "nearest",
      inline: "center",
    });
  }, [currentThemeId]);

  useEffect(() => () => {
    if (scrollTimer.current !== undefined) window.clearTimeout(scrollTimer.current);
  }, []);

  function selectTheme(themeId: ThemeId, scroll = true): void {
    setSelectedThemeId(themeId);
    if (!scroll) return;
    railRef.current?.querySelector<HTMLElement>(`[data-theme-card="${themeId}"]`)
      ?.scrollIntoView({
        behavior: reducedMotion ? "instant" : "smooth",
        block: "nearest",
        inline: "center",
      });
  }

  function settleScroll(event: UIEvent<HTMLDivElement>): void {
    if (scrollTimer.current !== undefined) window.clearTimeout(scrollTimer.current);
    const rail = event.currentTarget;
    scrollTimer.current = window.setTimeout(() => {
      const railCenter = rail.getBoundingClientRect().left + rail.clientWidth / 2;
      let closest: { distance: number; themeId: ThemeId } | undefined;
      for (const themeId of THEME_IDS) {
        const card = rail.querySelector<HTMLElement>(`[data-theme-card="${themeId}"]`);
        if (!card) continue;
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - railCenter);
        if (!closest || distance < closest.distance) closest = { distance, themeId };
      }
      if (closest) selectTheme(closest.themeId, false);
    }, 90);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = THEME_IDS.indexOf(selectedThemeId);
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      const previousThemeId = THEME_IDS[index - 1];
      if (previousThemeId) selectTheme(previousThemeId);
    } else if (event.key === "ArrowRight" && index < THEME_IDS.length - 1) {
      event.preventDefault();
      const nextThemeId = THEME_IDS[index + 1];
      if (nextThemeId) selectTheme(nextThemeId);
    }
  }

  return (
    <section
      className="theme-switcher"
      data-reduce-motion={reducedMotion || undefined}
      style={themeCssVariables(selectedThemeId)}
      aria-labelledby="theme-switcher-heading"
    >
      <header className="theme-switcher__heading">
        <h1 id="theme-switcher-heading" tabIndex={-1}>换个角色，继续看懂</h1>
        <p>主题会改变配色、角色语气和等待页，不会改动你的持仓与历史复盘。</p>
      </header>

      <div
        aria-label="可用主题"
        className="theme-switcher__rail"
        onKeyDown={handleKeyDown}
        onScroll={settleScroll}
        ref={railRef}
        role="radiogroup"
        tabIndex={0}
      >
        {THEME_IDS.map((themeId) => {
          const theme = THEMES[themeId];
          const artwork = themeClientAssets(themeId).selection;
          const selected = selectedThemeId === themeId;
          const current = currentThemeId === themeId;
          return (
            <button
              aria-checked={selected}
              aria-label={`${theme.label}${current ? "，当前使用" : ""}`}
              className="theme-switcher-card"
              data-current={current || undefined}
              data-selected={selected || undefined}
              data-theme-card={themeId}
              key={themeId}
              onClick={() => selectTheme(themeId)}
              role="radio"
              style={themeCssVariables(themeId)}
              type="button"
            >
              <span className="theme-switcher-card__artwork">
                <img
                  alt=""
                  decoding="async"
                  height={artwork.height}
                  src={artwork.src}
                  width={artwork.width}
                />
                {selected ? (
                  <span aria-hidden="true" className="theme-switcher-card__check">
                    <Check size={18} strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className="theme-switcher-card__copy">
                <strong>{theme.label}</strong>
                <span>{theme.description}</span>
                <small>{current ? "当前使用" : selected ? "已选中" : "点击或滑动选择"}</small>
              </span>
            </button>
          );
        })}
      </div>

      <p className="theme-switcher__hint" aria-live="polite">
        {canConfirm
          ? `将从「${THEMES[currentThemeId].label}」更换为「${THEMES[selectedThemeId].label}」`
          : `正在使用「${THEMES[currentThemeId].label}」`}
      </p>

      <footer className="theme-switcher__actions">
        <Button
          className="theme-switcher__confirm"
          disabled={!canConfirm}
          onClick={() => onConfirm(selectedThemeId)}
          variant="primary"
        >
          确认更换
        </Button>
      </footer>
    </section>
  );
}
