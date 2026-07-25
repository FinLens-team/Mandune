# Long Card

## Architecture

- `LongCardRuntimeInput` is the S9 boundary: exact `PortfolioSnapshot`, `AnalysisResult`, validated `ThemeModelOutput` when available, and explicit example metadata.
- `longCardRuntimeFromFixture` is the only demo-fixture adapter. Runtime callers do not cast records to `AnalysisFixture`.
- The narrative and evidence faces stay mounted in one 3D stage. The inactive face is `aria-hidden`, `inert`, and pointer-inert while each face keeps its own document-scroll offset.

## Gotchas & Decisions

- A normal letter requires a valid owned analysis, matching snapshot/theme/constraints, non-`unavailable` status, and a narrative bound to the exact ordered conclusion and advice IDs.
- Missing or mismatched narrative renders a recovery state. The front consumes the supplied narrative text and never substitutes static theme prose.
- Pointer handling does not capture or cancel a gesture until horizontal intent is established; normal window scrolling remains the only vertical reading region.
- Evidence rows always expose the contract's value/unit/source/observation/fetch fields. Missing fields are labelled as missing and relationships are never inferred.

## Commands

```sh
pnpm vitest run src/features/long-card/LongCard.test.tsx tests/long-card
```
