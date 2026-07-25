# Workspace Shell

## Architecture

- `WorkspaceShell` supports controlled `draft` and `reducedMotion` values with matching change callbacks. `initialDraft` and media-query motion preference remain uncontrolled defaults only.
- Experience source and the first-S4 coachmark use the same controlled/uncontrolled pattern through `experienceSource`, `reviewCoachmarkVisible`, and their callbacks; feature code never guesses persisted journey state.
- `activeAnalysis` plus `onResumeAnalysis` exposes the leave-and-return seam without owning analysis transport state.
- `useOverlayPresence` keeps drawers and dialogs mounted through their exit transition, and uses a double `requestAnimationFrame` before flipping `opening` → `open` so the entry transition actually plays (a single rAF can fire before the opening styles are committed, silently skipping the slide-in). `useOverlayFocus` traps focus, prevents initial focus scroll, locks background scrolling, and returns focus only after presence ends. `WorkspaceDrawer` and `AnalysisConfirmDialog` both drive `data-state` from the presence phase; the drawer uses asymmetric timing (340ms soft-spring entry, 200ms sharp exit).
- The home view is a dark poster stage scoped by `--poster-*` custom properties on `.workspace-home`; the portfolio view keeps the global light tokens. The poster is deliberately minimal: no visible title block and no badges; the only heading is a visually-hidden h1 (`.workspace-home__sr-only`, 满懂 · 每日复盘) that keeps the section label and focus management working. A top bar carries the small white brand mark plus a「主页」page label so users can tell where they are. The mascot is the single analysis entry (`nailong-laugh.webp` inside one button); there is deliberately no CTA button — a natural-language hint (点奶龙，开始今日复盘/复盘进行中，点奶龙继续) sits in the bottom-left row beside the menu button, and the confirm dialog provides the second-step confirmation. Poster copy comes from real journey state plus the「我是龙」theme strings — no return figures or forecasts may be added to captions because draft lines carry no observed performance field.
- The background `workspace-home__ticker` SVG is symbolic decoration only (three drifting sparkline loops, gold stroke, low stroke-opacity); it must never encode or resemble actual market data, and reduced motion freezes it in place via the shared kill-switch blocks. Each path holds two copies of an 800-unit pattern so a full ±800px slide loops seamlessly; line subtlety lives in `stroke-opacity` (not element `opacity`) because the reduce-motion block forces `opacity: 1 !important` on poster children.
- Theme captions render as bilibili-style danmaku (`workspace-home__danmaku`): `THEME_DANMAKU` in `WorkspaceShell.tsx` is the single extension point (append one string per new caption). Spawns pick a random caption and lane, fly right → left at constant linear speed (`danmaku-fly`, per-item `--danmaku-duration`), cap at 8 concurrent, pause when the page is hidden, and the layer is removed entirely under reduced motion.
- The white-on-transparent brand mark appears on the dark poster (top bar) and in the drawer footer's dark chip; it must never sit on a light surface. The home view is locked to `height: 100dvh` with `overflow: clip`; the hero scales via `max-height: 100%` instead of scrolling, and the error message floats absolutely inside the poster so it is never clipped away.
- `AnalysisConfirmDialog` groups facts into 四项约束 (2-column grid on ≥48rem) and 运行方式, keeps the e2e-bound heading「按当前输入发起今日复盘？」and button「开始复盘」, and renders the directionality disclosure as a neutral bordered block — never a risk-colored side-stripe.

## Gotchas & Decisions

- Controlled props are read directly on every render and are never copied into local state. Local state changes only in uncontrolled mode; change callbacks fire in both modes.
- `PortfolioEditor` marks the source as `edited` on the first holdings or constraints mutation while retaining the example-data meaning.

## Commands

```sh
pnpm vitest run tests/workspace-shell
```
