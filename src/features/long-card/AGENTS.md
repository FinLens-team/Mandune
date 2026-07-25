# Long Card

## Architecture

- `LongCardRuntimeInput` is the S9 boundary: exact `PortfolioSnapshot`, `AnalysisResult`, validated `ThemeModelOutput` when available, and explicit example metadata.
- `longCardRuntimeFromFixture` is the only demo-fixture adapter. Runtime callers do not cast records to `AnalysisFixture`.
- The narrative and evidence faces stay mounted in one 3D stage. The inactive face is `aria-hidden`, `inert`, and pointer-inert while each face keeps its own document-scroll offset.
- Validated streaming Markdown is an additional generated layer: it never replaces snapshot/version identity, coverage, deterministic conclusions/advice, evidence, derivations, gaps, or risk notes.

## Gotchas & Decisions

- A normal letter requires a valid owned analysis, matching snapshot/theme/constraints, non-`unavailable` status, and a narrative bound to the exact ordered conclusion and advice IDs.
- Missing or mismatched narrative renders a recovery state. The front consumes the supplied narrative text and never substitutes static theme prose.
- Pointer handling does not capture or cancel a gesture until horizontal intent is established; normal window scrolling remains the only vertical reading region.
- Horizontal dragging uses bounded exponential damping to preview the 3D rotation. A committed switch keeps both faces mounted, reveals the destination in nonlinear layers, and disables those transitions under either reduced-motion control.
- Report-adjacent Atlas banners live outside the 3D face height. They use equal-height clamped summaries and a viewport-bounded detail sheet, so multiple cards and inactive long-card faces cannot inflate document height.
- Evidence rows always expose the contract's value/unit/source/observation/fetch fields. Missing fields are labelled as missing and relationships are never inferred.
- Every analysis `risk_note` remains visible on both faces; the evidence face also exposes any material references attached to a risk note.

## Commands

```sh
pnpm vitest run src/features/long-card/LongCard.test.tsx tests/long-card
```
