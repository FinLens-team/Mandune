# Workspace Shell

## Architecture

- `WorkspaceShell` supports controlled `draft` and `reducedMotion` values with matching change callbacks. `initialDraft` and media-query motion preference remain uncontrolled defaults only.
- Experience source and the first-S4 coachmark use the same controlled/uncontrolled pattern through `experienceSource`, `reviewCoachmarkVisible`, and their callbacks; feature code never guesses persisted journey state.
- `activeAnalysis` plus `onResumeAnalysis` exposes the leave-and-return seam without owning analysis transport state.
- `useOverlayPresence` keeps drawers and dialogs mounted through their exit transition. `useOverlayFocus` traps focus, prevents initial focus scroll, locks background scrolling, and returns focus only after presence ends. `WorkspaceDrawer` and `AnalysisConfirmDialog` both drive `data-state` from the presence phase; the drawer uses asymmetric timing (340ms soft-spring entry, 200ms sharp exit).
- The home view is a dark poster stage scoped by `--poster-*` custom properties on `.workspace-home`; the portfolio view keeps the global light tokens. Poster copy comes from real journey state plus the「我是龙」theme strings — no return figures or forecasts may be added to badges or bubbles because draft lines carry no observed performance field.
- The brand logo asset is white-on-transparent: it is legible on the poster (home top-left) and inside the drawer footer's dark chip, but never place it directly on a light surface.

## Gotchas & Decisions

- Controlled props are read directly on every render and are never copied into local state. Local state changes only in uncontrolled mode; change callbacks fire in both modes.
- `PortfolioEditor` marks the source as `edited` on the first holdings or constraints mutation while retaining the example-data meaning.

## Commands

```sh
pnpm vitest run tests/workspace-shell
```
