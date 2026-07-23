# FinLens Delivery Tickets

## How to Use This Plan

This file seeds GitHub Issues. Replace `FNL-xxx` dependencies with real Issue numbers and preserve the dependency edges. Close a ticket only after attaching its observable acceptance evidence.

The sequence is tracer-bullet first: prove one honest public guest loop before broadening domain state, input methods, market coverage, analysis, or presentation. Privacy and advice rules apply to every ticket. No ticket below selects a framework, model provider, market-data vendor, storage engine, authentication protocol, or deployment API; create an evidence-backed ADR before such a choice becomes binding.

## Dependency Graph

| ID | Deliverable | Depends on |
|---|---|---|
| FNL-000 | Phase 0 technical and deployment ADR | None |
| FNL-001 | Phase 0 public guest tracer bullet | FNL-000 |
| FNL-002 | Source-account and holding model | FNL-001 |
| FNL-003 | Manual entry, confirmation, and snapshots | FNL-002 |
| FNL-004 | Screenshot-assisted drafts and recovery | FNL-003 |
| FNL-005 | Market-data adapter integration | FNL-001, FNL-003 |
| FNL-006 | Limited-analysis and directional engine | FNL-003, FNL-005 |
| FNL-007 | Card themes with invariant reasoning | FNL-006 |
| FNL-008 | Private real-user workspace and deletion | FNL-004, FNL-006 |
| FNL-009 | NFC and QR field-readiness hardening | FNL-001, FNL-008 |
| FNL-010 | Complete MVP acceptance record | FNL-007, FNL-008, FNL-009 |

## FNL-000: Select the Phase 0 Technical and Deployment Baseline

**Scenario:** A builder needs a minimal, reproducible way to deliver the public mobile tracer bullet without silently binding the long-term product to an unreviewed stack or service.

**Scope:** Compare the smallest credible frontend/runtime, test, and HTTPS deployment options against the Phase 0 acceptance criteria; record the selected baseline and its replacement boundary in an ADR. Include local development, automated verification, secret handling, public deployment, rollback, and expected Qoder use.

**Non-goals:** Selecting the final production architecture, real-user authentication, persistent financial storage, a market-data vendor, an AI model provider, or infrastructure for later MVP phases.

**Acceptance:**

- The ADR compares at least two viable baselines using delivery speed, mobile/browser support, testability, deployment/rollback, secret exposure, Qoder compatibility, and migration cost.
- The selected baseline can serve one HTTPS route, run locally from documented commands, and support deterministic normal and failed-adapter fixtures.
- The design keeps the market adapter, analysis contract, and presentation contract replaceable.
- No real financial data or long-lived secret is required for Phase 0.
- Repository commands and durable project knowledge are updated after the baseline is accepted.

## FNL-001: Prove the Phase 0 Public Guest Loop

**Scenario:** A judge opens one public HTTPS route on a 375px phone, makes the visible theme and simulated-demo choices, reads one daily card, inspects its evidence, and deliberately observes evidence failure.

**Scope:** Deliver one fixed simulated portfolio snapshot, one implemented theme variant paired with the canonical rational evidence view, a vendor-neutral market adapter contract backed by a deterministic fixture or one implementation, a narrative front, an evidence back, directional guidance, timestamps, a risk notice, a forced adapter-failure state, and standards-compatible QR/NFC URL handoffs to the same public route.

**Non-goals:** Real-user accounts, persistence, screenshot extraction, broad asset coverage, multiple finished themes, authentication, production NFC objects, or a final vendor choice.

**Acceptance:**

- From a fresh 375px session, the card is reachable through no more than the visible theme and `Try simulated demo` choices.
- `Simulated` remains visible on the portfolio, narrative front, and evidence back.
- The evidence back shows snapshot time, evidence cutoff, dated evidence, main derivation, assumptions, limitations, and risk notice.
- The theme front and rational representation use identical fixture inputs, evidence, calculation output, coverage, and guidance. Runtime switching between multiple themes is deferred to FNL-007.
- Forced adapter failure returns limited or unavailable analysis without fabricated current values.
- The flow works with touch and keyboard, without personal data or NFC hardware.
- QR, NFC URL handoff, and an ordinary link resolve to the same generic HTTPS route; decoded payloads contain no personal financial data, credentials, or sensitive parameters.

## FNL-002: Establish Source-Account and Holding State

**Scenario:** A user represents where each holding came from without implying live brokerage connectivity or verified balances.

**Scope:** Define source accounts, holding drafts, confirmed versions, provenance, coverage, and lifecycle rules.

**Acceptance:**

- Two source accounts can coexist and every holding references one.
- Draft, confirmed, rejected, unresolved, and unsupported states are distinct; zero and unknown remain distinct.
- Removing an account reports affected drafts, holdings, snapshots, and analyses before deletion.
- No state implies institution verification or live synchronization.

## FNL-003: Deliver Manual Entry, Confirmation, and Immutable Snapshots

**Scenario:** A user enters holdings, confirms usable data, provides four constraints, and creates a versioned snapshot without changing earlier analyses.

**Scope:** Manual drafts, edit/reject/confirm, provenance, the four constraints including `unknown`, and immutable snapshots.

**Acceptance:**

- Only confirmed row versions enter a snapshot; editing cannot mutate an existing snapshot.
- Confirmed rows show account, entry method, observation date, confirmation state, and unresolved fields.
- A snapshot freezes holding versions, source references, valuation basis, constraints, creation time, and coverage.
- Unsupported and unvalued holdings remain visible; exclusions are disclosed.
- Repeated saves are idempotent and visibly distinguish saved, pending, and failed states.

## FNL-004: Add Screenshot-Assisted Drafts and Confirmation

**Scenario:** A user uploads a holdings screenshot, receives uncertain draft rows, corrects or rejects them, and confirms only reviewed data.

**Scope:** Sensitive-data disclosure, upload, extraction to drafts, uncertainty, provenance, recovery, manual fallback, and disclosed image retention.

**Acceptance:**

- Upload disclosure states sensitivity, processing purpose, retention, and external processing where applicable.
- A simulated screenshot creates drafts, with ambiguous fields unresolved.
- No row enters a snapshot before explicit confirmation.
- Partial extraction preserves recoverable work and offers retry and manual entry.
- Raw screenshots and unrelated text do not enter public assets, logs, analytics, fixtures, or Issues.

## FNL-005: Integrate a Typed Market-Data Adapter

**Scenario:** Analysis requests normalized, dated evidence without depending on one vendor or treating stale retrieval as current truth.

**Scope:** Implement the adapter contract for the MVP asset subset, identity resolution, normalized observations, provenance, timestamps, caveats, and typed states.

**Acceptance:**

- Contract tests cover `available`, `stale`, `ambiguous`, `unsupported`, `rate-limited`, and `failed`.
- Responses distinguish observation time from retrieval time and identify the source.
- Unsupported or ambiguous identities never receive invented values.
- Replacing the adapter does not change portfolio, evidence, snapshot, or card contracts.

## FNL-006: Build the Limited-Analysis and Directional Engine

**Scenario:** A user receives only conclusions supported by the confirmed snapshot, four constraints, and dated evidence.

**Scope:** Version-bound claims, calculations or rule outcomes, unknowns, coverage, bounded guidance, risk notice, and recovery across supported, limited, observation-only, and unavailable states.

**Acceptance:**

- Every material claim maps to confirmed input, derived result, or dated evidence.
- Guidance stays directional and names its triggering constraint or evidence.
- Missing, stale, unsupported, ambiguous, contradictory, or unavailable inputs narrow dependent conclusions.
- When nothing material is supportable, the result explains why and how to recover rather than showing a normal card.
- Policy tests reject exact personalized quantities, percentages, prices, times, guarantees, and transaction actions.

## FNL-007: Add Card Themes Without Changing Reasoning

**Scenario:** A user changes presentation theme while receiving the same financial conclusions for identical inputs.

**Scope:** Accessible default, theme change, fixed mascot identity, narrative fronts, evidence backs, and presentation-only rerendering.

**Acceptance:**

- Calculations, evidence, coverage, risk classification, and guidance remain equal across themes.
- Theme changes affect only vocabulary, artwork, pacing, and presentation.
- The mascot remains recognizable in identity, character, and responsibility.
- Risk notices, provenance, unknowns, timestamps, coverage, and simulated/real status remain legible.

## FNL-008: Enforce Private Workspaces and Safe Deletion

**Scenario:** A user can use and delete a private workspace while visitors with only a public entry URL see no personal content.

**Scope:** Minimum private-session boundary, disclosure, private access, redaction, deletion, retention exceptions, and fail-closed behavior.

**Acceptance:**

- Unauthenticated access, search preview, and generic entry URL reveal no private data.
- Expired sessions hide private data and sensitive pending actions fail closed.
- Public assets, logs, analytics, errors, and previews contain no raw screenshots, credentials, account identifiers, or full portfolio payloads.
- Deletion returns a visible result; failures and exceptions state remaining scope and recovery.

## FNL-009: Harden NFC and QR Field Readiness

**Scenario:** After the Phase 0 handoff works, the team needs repeatable field evidence that common devices, printed QR, and the selected NFC tag open the same mobile entry without exposing private data.

**Scope:** Harden and revalidate the existing generic handoff across target phones and browsers, document NFC writing and booth setup, verify printed QR readability and ordinary-link fallback, and repeat negative private-route checks after the real-user workspace exists.

**Acceptance:**

- All three entry modes reach the same useful state.
- Encoded URLs contain no portfolio data, account identifiers, credentials, sensitive parameters, or private authorization.
- Lack of NFC, camera, or QR scanning does not block the ordinary URL and manual flow.
- A forwarded generic entry URL cannot reveal a private workspace.

## FNL-010: Assemble the Complete MVP Acceptance Record

**Scenario:** A reviewer verifies the full guest and real-user loops from confirmed inputs to evidence, bounded guidance, degradation, privacy, and recovery.

**Scope:** Run the complete acceptance matrix, repair integration defects within existing contracts, and publish the evidence in MVP Specification Section 9.

**Acceptance:**

- Every Phase 0 and MVP criterion has a linked passing test or observable artifact.
- The real-user flow works at 375px without requiring hover, animation, NFC, QR, camera, or screenshot extraction.
- Evidence includes guest and real-user recordings, snapshot transition, normal and limited cards, adapter tests, and privacy verification.
- A claim-to-evidence audit covers every material statement on the demonstrated card.
- Open failures remain blocking Issues; MVP is not marked complete while criteria lack evidence.

## Optional Post-MVP Candidates

Do not schedule these until FNL-010 is accepted. Each needs a fresh product decision and updated acceptance criteria: institution connectors, intraday alerts, expanded assets or jurisdictions, longitudinal calibration, collaboration, additional themes or native clients, and production NFC objects or private expiring deep links.

Trade execution, automatic rebalancing, custody, guaranteed returns, and exact personalized trade instructions remain outside the product contract.
