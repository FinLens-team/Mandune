# Client Journey

## Architecture

- `state.ts` owns the pure S0-S10 journey reducer; `controller.ts` owns transport, persistence, recovery, and navigation effects.
- `gateway.ts` is the same-origin, Cookie-authorized HTTP boundary. The browser never receives or stores the workspace locator.
- `runtime.ts` is the final display gate for `LongCard`: snapshot, analysis, constraints, theme, narrative IDs, and guidance must remain version-consistent.
- Browser storage is optional and workspace-scoped. It stores onboarding completion, reduced-motion preference, the first-S4 coachmark dismissal, the active analysis ID, current experience source, and an `analysis_id`-keyed frozen source map; durable drafts, tasks, results, and history remain server-owned.

## Conventions

- Treat malformed or mismatched gateway payloads as unavailable. Never render partial analysis or narrative data.
- Serialize draft writes and only publish the latest revision. Analysis start must wait for a successful durable draft save.
- Leaving analysis does not cancel it. Persist the analysis ID so bootstrap can resume the same task after refresh.
- History replay uses the saved immutable record and never re-fetches providers or recalculates with current contracts.
- Freeze `random` versus `edited` when an analysis ID is created. S9 and S10 resolve that saved value by analysis ID and never infer an old record from the current draft source.

## Commands

```sh
pnpm vitest run tests/journeys
pnpm check
pnpm build
```
