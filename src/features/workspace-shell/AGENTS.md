# Workspace Shell

## Architecture

- `WorkspaceShell` supports controlled `draft` and `reducedMotion` values with matching change callbacks. `initialDraft` and media-query motion preference remain uncontrolled defaults only.
- `activeAnalysis` plus `onResumeAnalysis` exposes the leave-and-return seam without owning analysis transport state.

## Gotchas & Decisions

- Controlled props are read directly on every render and are never copied into local state. Local state changes only in uncontrolled mode; change callbacks fire in both modes.

## Commands

```sh
pnpm vitest run tests/workspace-shell
```
