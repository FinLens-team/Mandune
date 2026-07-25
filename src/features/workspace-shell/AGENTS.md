# Workspace Shell

## Architecture

- `WorkspaceShell` supports controlled `draft` and `reducedMotion` values with matching change callbacks. `initialDraft` and media-query motion preference remain uncontrolled defaults only.
- Experience source and the first-S4 coachmark use the same controlled/uncontrolled pattern through `experienceSource`, `reviewCoachmarkVisible`, and their callbacks; feature code never guesses persisted journey state.
- `activeAnalysis` plus `onResumeAnalysis` exposes the leave-and-return seam without owning analysis transport state.
- `useOverlayPresence` keeps drawers and dialogs mounted through their exit transition, and uses a double `requestAnimationFrame` before flipping `opening` → `open` so the entry transition actually plays (a single rAF can fire before the opening styles are committed, silently skipping the slide-in). `useOverlayFocus` traps focus, prevents initial focus scroll, locks background scrolling, and returns focus only after presence ends. `WorkspaceDrawer` and `AnalysisConfirmDialog` both drive `data-state` from the presence phase; the drawer uses asymmetric timing (340ms soft-spring entry, 200ms sharp exit).
- The home view is a dark poster stage scoped by `--poster-*` custom properties on `.workspace-home`; the portfolio view keeps the global light tokens. The poster top is the theme main copy「哈呃呃涨涨」(expression only), the runtime-state title (今日持仓观察/复盘进行中) stays state-driven below it, and the centered mascot uses `nailong-laugh.webp`. Poster copy comes from real journey state plus the「我是龙」theme strings — no return figures or forecasts may be added to badges or captions because draft lines carry no observed performance field.
- The background `workspace-home__ticker` SVG is symbolic decoration only (three drifting sparkline loops, gold stroke, low stroke-opacity); it must never encode or resemble actual market data, and reduced motion freezes it in place via the shared kill-switch blocks. Each path holds two copies of an 800-unit pattern so a full ±800px slide loops seamlessly; line subtlety lives in `stroke-opacity` (not element `opacity`) because the reduce-motion block forces `opacity: 1 !important` on poster children.
- Floating captions spawn on a timer at random poster positions, rise and fade out (`caption-rise`, capped at 3 concurrent), pause when the page is hidden, and are removed entirely under reduced motion. There are no always-visible static bubbles anymore.
- The home poster no longer carries the brand logo; the white-on-transparent logo remains in the drawer footer's dark chip and must never sit on a light surface.

## Gotchas & Decisions

- Controlled props are read directly on every render and are never copied into local state. Local state changes only in uncontrolled mode; change callbacks fire in both modes.
- `PortfolioEditor` marks the source as `edited` on the first holdings or constraints mutation while retaining the example-data meaning.

## Commands

```sh
pnpm vitest run tests/workspace-shell
```
