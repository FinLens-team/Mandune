# Client Journey

## Architecture

- `state.ts` owns the pure S1-S10 journey reducer (S0 is intentionally not rendered); `controller.ts` owns transport, persistence, recovery, and navigation effects.
- `gateway.ts` is the same-origin, Cookie-authorized HTTP boundary. The browser never receives or stores the workspace locator.
- `runtime.ts` is the final display gate for `LongCard`: snapshot, analysis, constraints, theme, narrative IDs, and guidance must remain version-consistent.
- Browser storage is optional and workspace-scoped. It stores onboarding completion, reduced-motion preference, the first-S4 coachmark dismissal, the active analysis ID, current experience source, and an `analysis_id`-keyed recovery hint; durable drafts, tasks, results, and history remain server-owned.
- The current theme is a workspace-scoped browser preference. The theme switcher updates it only after explicit confirmation; analysis creation freezes that value into the server-owned snapshot, so changing the current theme never rewrites an active or historical report.
- Confirming a different theme clears any mismatched client-side active-analysis recovery reference. The old immutable task/history remains untouched, while the next mascot entry starts from the newly selected workspace theme instead of reopening the old theme's waiting page.

## Conventions

- Treat malformed or mismatched gateway payloads as unavailable. Never render partial analysis or narrative data.
- Serialize draft writes and only publish the latest revision. Analysis start must wait for a successful durable draft save.
- Leaving analysis does not cancel it. Persist the analysis ID so bootstrap can resume the same task after refresh.
- The analysis SSE carries cumulative, progress-only Markdown headings. `App` keeps one subscription per active `analysisId`; `AnalysisProgress` derives deduplicated `正在生成 …` lines from headings while durable task events remain the reconnect fallback. Full model prose is exposed only by the terminal result endpoint after validation.
- History replay uses the saved immutable record and never re-fetches providers or recalculates with current contracts.
- The result-page history action carries the displayed `analysis_id` into S10 and opens that exact committed record after the history list loads. Drawer navigation clears that target and shows the complete list.
- The result page has no inline navigation action bar. It uses the persistent workspace drawer, while the report-owned Atlas reveal loads every new or repeated card attached to the displayed `analysis_id`, including immutable history replay.
- Send `random` versus `edited` when starting analysis so the server-owned run freezes it into immutable history. S9 and S10 read the record-owned value; legacy V1 records without it remain unknown and are never inferred from the current draft or browser storage.

## Commands

```sh
pnpm vitest run tests/journeys
pnpm check
pnpm build
```
