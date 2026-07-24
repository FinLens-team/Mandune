# Long Card

## Architecture

- `LongCardRuntimeInput` is the S9 boundary: exact `PortfolioSnapshot`, `AnalysisResult`, validated `ThemeModelOutput` when available, and explicit example metadata.
- `longCardRuntimeFromFixture` is the only demo-fixture adapter. Runtime callers do not cast records to `AnalysisFixture`.

## Gotchas & Decisions

- A normal letter requires a valid owned analysis, matching snapshot/theme/constraints, non-`unavailable` status, and a narrative bound to the exact ordered conclusion and advice IDs.
- Missing or mismatched narrative renders a recovery state. The front consumes the supplied narrative text and never substitutes static theme prose.

## Commands

```sh
pnpm vitest run src/features/long-card/LongCard.test.tsx tests/long-card
```
