# FinLens MVP Specification

`FinLens` is the current working name. The fixed mascot identity is a confirmed product constraint.

## 1. Purpose

FinLens turns a user's confirmed portfolio snapshot and a small set of personal constraints into one daily, inspectable analysis card. The experience may use a chosen narrative theme to make the result approachable, but every conclusion must remain traceable to confirmed holdings, dated market evidence, explicit assumptions, and known limitations.

This document defines observable product behavior. It does not select an exact framework, model provider, market-data vendor, authentication protocol, or deployment API. Qoder is the current competition build constraint, not a required runtime or an undisclosed dependency.

## 2. End-to-End Contract

The MVP is complete only when a user can finish this loop:

1. Choose a presentation theme and understand that theme affects presentation, not financial reasoning.
2. Enter as a clearly labeled guest demo or continue as a real user.
3. For a real user, create one or more source accounts and add holdings manually or from a screenshot-assisted draft.
4. Review every imported row, its provenance, and any uncertain fields before confirming it.
5. Produce an immutable, time-stamped portfolio snapshot from confirmed rows.
6. Provide four minimum personal constraints.
7. Request the day's analysis.
8. Receive a themed narrative front and a rational evidence back, with directional guidance, limitations, data timestamps, and no automatic transaction.
9. Return later and distinguish the current snapshot and analysis from stale or superseded versions.

No step may silently convert simulated, extracted, inferred, stale, or unavailable data into confirmed real-user facts.

## 3. Core Terms and States

- **Guest demo:** a no-account demonstration whose holdings and analysis are simulated. Every demo surface that shows money, positions, or advice is visibly labeled `Simulated` or an equivalent unambiguous label.
- **Real user:** a user working with holdings that they claim are their own. "Real" describes user intent and data ownership; it does not mean FinLens has verified a brokerage balance.
- **Source account:** a user-named container describing where a holding came from, such as a brokerage, bank, wallet, or manual portfolio. In the MVP this is provenance, not a promise of live institution connectivity.
- **Holding draft:** an unconfirmed row created by manual entry or screenshot extraction.
- **Confirmed holding:** a row the user has reviewed and explicitly accepted.
- **Portfolio snapshot:** a versioned, time-stamped set of confirmed holdings plus the constraints used for analysis. Later edits create a new snapshot; they do not rewrite a prior analysis silently.
- **Evidence item:** a dated market-data or user-provided input used by an analysis claim, including source, observation time, retrieval status, and any caveat available from the source.
- **Daily analysis card:** an analysis bound to one portfolio snapshot and one evidence cutoff. It is not a continuously updating quote screen.
- **Limited analysis:** a result produced when some requested evidence is missing, stale, unsupported, or contradictory. It narrows claims rather than filling gaps with guesses.

## 4. Staged Delivery

### Phase 0: Tracer Bullet

Phase 0 proves one honest vertical path before broadening input methods or visual polish.

Included:

- One responsive public-web route that opens from a normal link and from QR/NFC handoff.
- One implemented theme variant whose effect is visible on the narrative layer only, paired with the canonical rational evidence view.
- One guest demo portfolio with unmistakable simulated-data labeling.
- One controlled, deterministic seed selection from a versioned whitelist of simulated holdings, with a visible seed or scenario identifier. The selection is reproducible and is not unconstrained random generation.
- One market-data adapter implementation or deterministic fixture behind the same adapter contract.
- One generated daily card with a narrative front, evidence back, directional guidance, data timestamp, and risk notice.
- One forced adapter-failure scenario that produces a visible limited-analysis state.

Phase 0 is successful when a judge can open the link on a phone, identify that the portfolio is simulated, inspect why the guidance was produced, and observe truthful degradation when evidence is unavailable.

Phase 0 does not prove real-user onboarding, screenshot extraction quality, account persistence, broad asset coverage, Active Query, or model integration. Its deterministic analysis path need not call a model.

### MVP

The MVP adds the real-user loop defined in Section 2:

- Theme onboarding with an accessible default and a later theme-change path.
- Guest demo separated from real-user state.
- Real-user source-account creation.
- Manual holding entry.
- Screenshot multimodal autofill into drafts.
- Row-level review, confirmation, correction, rejection, and provenance.
- Versioned portfolio snapshots.
- Four minimum user constraints.
- Market-data retrieval through the adapter boundary.
- Daily analysis cards with themed narrative fronts and rational evidence backs.
- Plain-language translation of financial concepts tied to the current holdings, evidence, or conclusion.
- Directional, non-transactional guidance.
- Limited-analysis degradation and explicit failure recovery.
- Mobile-first public-web access suitable for QR and NFC entry.
- Privacy controls and safe deletion behavior.

### Later Additions

The following may follow the MVP but are not required to claim it complete:

- Direct brokerage, bank, wallet, exchange, or open-banking connections.
- Automatic position synchronization and reconciliation.
- Trade execution, order routing, automatic rebalancing, or custody.
- Intraday alerts, streaming quotes, and continuous portfolio monitoring.
- Expanded asset classes, jurisdictions, tax lots, tax analysis, and regulatory suitability workflows.
- Household or advisor collaboration, shared portfolios, comments, and approvals.
- Longitudinal outcome tracking, backtesting, scenario simulation, and recommendation calibration.
- Additional themes, richer narrative systems, native applications, widgets, and wearable experiences.
- Production NFC objects; the MVP only requires a standards-compatible web handoff.
- Active Query about holdings, asset classes, portfolio risk, or an existing review.

## 5. Functional Requirements

### 5.1 Theme Onboarding

The first session asks the user to choose a presentation theme or accept a clear default. The choice may change vocabulary, artwork, pacing, and the narrative front, but it must not change calculations, evidence selection, evidence sufficiency, coverage, risk classification, or directional guidance for identical inputs.

Changing the theme later re-renders presentation without creating different financial conclusions. Risk notices, provenance, missing-data states, and evidence labels remain legible in every theme and cannot be hidden by narrative styling.

### 5.2 Guest Demo

Guest mode requires no real financial data. The entry choice distinguishes `Try simulated demo` from the real-user path before holdings are shown.

All guest holdings, account names, portfolio values, evidence-derived outputs, and guidance are labeled as simulated on both the card front and back. A screenshot cropped to the main result must still contain a simulated-data label. Demo activity cannot be merged into a real user's portfolio without an explicit import-and-confirm action.

Phase 0 selects its guest portfolio through a controlled deterministic seed from a versioned simulated whitelist. The UI exposes the seed or scenario identifier, the same whitelist version and seed reproduce the same snapshot, and arbitrary random assets or values cannot enter the scenario.

### 5.3 Real-User Source Accounts

A real user can create, rename, and remove source accounts. At minimum, a source account records a user-visible name and account category. Optional identifiers must be minimized and masked where displayed.

Each holding belongs to one source account. Removing an account warns about affected drafts, confirmed holdings, snapshots, and analyses before deletion. The product must not imply that a manually named source account is institution-verified or live-synchronized.

### 5.4 Holding Entry

Manual entry creates a draft row. The minimum analyzable fields are asset identity, quantity or position value, valuation currency, source account, and observation date. The interface distinguishes zero from unknown and does not invent cost basis, current price, ticker, currency, or quantity.

The user can edit or delete a draft before confirmation. Unsupported assets remain visible with an `unsupported` status and cannot be silently omitted from portfolio totals or analysis coverage.

### 5.5 Screenshot Multimodal Autofill

The user may upload or capture a holdings screenshot. Multimodal extraction produces draft rows only. Before extraction, the product explains that the image may contain sensitive financial and identifying information and states whether the original image is retained, for how long, and for what purpose.

Extracted rows show field-level uncertainty when available and at least row-level `needs review` status. Blank, ambiguous, conflicting, or low-confidence fields stay unresolved. The original screenshot is never treated as authorization to transact or as independently verified proof of ownership.

The user can correct, reject, or confirm each row independently. A failed or partial extraction preserves recoverable drafts, identifies the affected rows, and offers retry or manual entry without requiring the user to restart onboarding.

### 5.6 Row-Level Confirmation and Provenance

Every holding row exposes:

- source account;
- entry method: manual or screenshot-assisted;
- user-confirmation status and time;
- observation date;
- corrections made after extraction, without requiring the original sensitive value to remain visible indefinitely;
- unresolved or unsupported fields.

Only confirmed rows enter a portfolio snapshot. Bulk confirmation is allowed only if all included rows remain visible and the action explicitly states that the user is confirming every selected row. An edit to a confirmed row returns the changed row to review or records a new confirmed version; it may not silently alter an existing snapshot.

### 5.7 Portfolio Snapshot

Creating a snapshot freezes the confirmed holding versions, source-account references, valuation basis, four constraints, creation time, and coverage status used by the analysis. The snapshot summary shows total represented value when computable, allocation by supported holding, unsupported or unvalued holdings, and any currency-conversion limitation.

An analysis references its snapshot identifier and evidence cutoff. If holdings or constraints change, the UI marks the old card as based on an earlier snapshot and offers a new analysis. Historical cards do not adopt later data silently.

### 5.8 Four Minimum User Constraints

Before real-user analysis, FinLens requires exactly four minimum user-authored constraints:

1. **Investment horizon:** how long the user expects not to need the invested funds.
2. **Near-term liquidity need:** whether the user has a specific, foreseeable need for funds in the near term and, if known, when and how much.
3. **Tolerable drawdown:** the maximum temporary portfolio loss the user says they can tolerate before the current course becomes unacceptable.
4. **Objective:** one of `capital preservation`, `steady growth`, or `long-term growth` (`保值`、`稳健增长`、`长期增长`).

Each constraint supports `unknown/not decided` when the user cannot answer. Unknown is a real input that reduces analysis scope; the product must not replace it with a default presented as the user's preference. The card back shows the exact constraints used and flags contradictions, such as a near-term liquidity need paired with an illiquid holding, without claiming a complete suitability assessment. These four inputs are the MVP's minimum decision constraints, not a risk questionnaire or a complete investor profile.

### 5.9 Market-Data Adapter Boundary

All external market evidence enters analysis through a vendor-neutral adapter boundary. The analysis layer requests normalized observations and receives, per request:

- asset identifier and identity-resolution status;
- requested measure;
- value and units when available;
- market/observation timestamp and retrieval timestamp;
- source identity or source class suitable for user-visible provenance;
- status such as available, stale, unsupported, ambiguous, rate-limited, or failed;
- source caveats that affect interpretation.

Each requested measure has a documented freshness and staleness policy. The adapter output includes a source locator or source class, observation and retrieval timestamps, normalization evidence for values and units, and identity-resolution evidence. The evidence record can represent upstream revisions and contradictions without silently overwriting the prior observation.

The adapter must not manufacture a value for an unsupported symbol, confuse retrieval time with market time, or collapse stale and current data into the same status. Contract fixtures cover revisions and contradictions as well as availability failures. Verification logs are credential-free. The product can replace adapters without changing the portfolio, evidence, or card contracts.

No requirement in this specification implies a particular vendor endpoint, authentication scheme, symbol format, polling interval, or paid-data entitlement.

### 5.10 Daily Analysis Card

Each card has two equally available sides or views.

**Narrative front:** communicates the day's portfolio condition in the chosen theme, identifies the most material tension or stability signal, and gives concise directional guidance. It also displays snapshot time, evidence cutoff, analysis coverage, simulated/real-user status, and a route to the evidence back.

**Rational evidence back:** states the conclusion in plain language and lists the user constraints, relevant holdings, calculations or rule outcomes, evidence items, assumptions, unknowns, conflicts, unsupported coverage, and risk notice. Each material claim maps to at least one confirmed user input or evidence item. The back distinguishes observed fact, derived calculation, and generated interpretation.

The themed front must not overstate what the rational back supports. If the back changes because evidence or a snapshot changes, the front is regenerated from that same versioned input.

The card may translate a financial concept only when it helps a target novice understand the current holdings, evidence, or conclusion. The explanation remains secondary to evidence and guidance, and it must not change the rational conclusion.

If analysis generation calls a model, the system validates the model response against a named schema and version before display. It labels observed, derived, and generated content; handles timeout, malformed output, and bounded retry; applies input/output redaction and disclosed external processing; and never displays a normal card after model failure. A deterministic path, including Phase 0, may omit model calls entirely.

### 5.11 Directional Guidance

Guidance is limited to inspectable directions such as `maintain`, `review`, `reduce concentration`, `increase accessible reserves`, `pause until data is confirmed`, or `seek qualified human advice`. It explains which constraint or evidence caused the direction and what additional information could change it.

The MVP does not issue or execute orders, prescribe an exact trade quantity as a personalized instruction, guarantee outcomes, claim to beat the market, or present the result as regulated fiduciary, tax, or legal advice. The user remains the decision-maker. Weakly supported cases route to review rather than stronger language. Wording may become more direct and urgent only when confirmed inputs and evidence show that a supported risk boundary has been breached; it names that boundary and still does not issue an exact trade command.

### 5.12 Limited Analysis and Degradation

Evidence sufficiency and analysis coverage are visible as statuses, not hidden in generic confidence wording. These statuses describe support for the current conclusion, not the probability of a market outcome, and must not be presented as `high confidence` prediction promises. FinLens returns a limited analysis when at least one material input is unknown, ambiguous, stale beyond the product's disclosed policy, unsupported, contradictory, or unavailable.

A limited card must:

- identify exactly what is missing or unreliable;
- state which holdings or claims are affected;
- omit or narrow conclusions that depend on the gap;
- preserve supported observations and evidence;
- give a concrete recovery action, such as confirm a row, enter a missing constraint, retry data later, or consult a human;
- avoid converting absence of evidence into evidence of safety.

If no material conclusion is supportable, the product returns `analysis unavailable` with reasons and recovery steps. It does not generate a normal-looking narrative card from unsupported assumptions.

### 5.13 Mobile, Public Web, NFC, and QR

The primary experience is a public-web application usable on a current mobile browser without installing an app. Public web means the application shell is reachable; private portfolio data and cards are not public by default.

A QR code and an NFC tag may encode the same HTTPS entry link. Opening either reaches a useful mobile entry state and does not expose portfolio data, bearer credentials, or sensitive query parameters. If an authenticated deep link is later supported, it must expire and fail closed.

Core onboarding, row review, snapshot creation, card reading, front/back switching, failure recovery, and data deletion work at a 375px-wide viewport with touch input. Essential evidence and warnings are available without hover, theme animation, NFC hardware, camera permission, or screenshot upload. QR/NFC failure always has an ordinary clickable or typeable URL fallback.

### 5.14 Privacy

FinLens collects only data required for the stated portfolio analysis. Before a real-user submission, it explains what is stored, why, whether an external model or data service processes it, retention behavior, and how to delete it.

Sensitive screenshots are private by default, excluded from public asset paths, logs, analytics payloads, demo fixtures, and share previews. Credentials, full account numbers, unrelated screenshot text, and authentication artifacts are never included in analysis evidence. Logs use redacted identifiers and must not contain raw screenshots or full portfolio payloads by default.

Users can delete uploaded screenshots and their real-user workspace. Deletion gives a visible result and describes any retention exception instead of promising immediate erasure where it cannot be guaranteed. Sharing a card is an explicit action; the default card URL is not publicly indexable or transferable as access control.

## 6. Failure-State Contract

| Failure | Observable behavior | Required recovery |
|---|---|---|
| Screenshot is unreadable or partial | No rows are auto-confirmed; affected fields are marked unresolved | Retake, upload another image, or enter manually |
| Asset identity is ambiguous | Candidate identities remain a draft choice; no market value is attached | User selects or enters the asset identity |
| Duplicate rows are suspected | Potential duplicates are highlighted; neither row is silently deleted | User compares and accepts, merges, or rejects |
| Market data is stale or unavailable | Timestamp/status is shown and dependent claims are limited or withheld | Retry later, use confirmed manual observation where supported, or continue with limited analysis |
| Adapter is rate-limited or fails | Existing confirmed portfolio remains intact; no fabricated evidence appears | Retry with backoff or return a limited/unavailable card |
| Market evidence is revised or contradicts another source | Both versions or positions remain traceable; dependent claims are marked limited or withheld | Reconcile under the documented measure policy or await a supported source |
| Constraints are missing or contradictory | The affected direction is withheld and the conflict is named | User edits constraints or accepts limited scope |
| Analysis generation times out, returns malformed content, or fails schema/version validation | No partial text or normal card is presented as a completed recommendation | Retry within the bounded policy or return analysis unavailable without duplicating holdings or snapshots |
| Session/authentication expires | Private data is hidden and pending sensitive actions fail closed | Re-authenticate; preserve only data allowed by the disclosed session policy |
| Network is interrupted during save | UI distinguishes saved, pending, and failed states | Retry idempotently; do not duplicate rows or snapshots |
| NFC/QR/camera is unavailable | No loss of core capability | Use the normal web URL and manual entry |
| Deletion fails or is delayed | Failure and retained scope are stated explicitly | Retry or use the published support/escalation route |

## 7. Acceptance Criteria

### 7.1 Phase 0 Acceptance

- From a fresh 375px mobile session, a tester reaches the simulated daily card from an HTTPS link in no more than the visible theme and demo choices.
- `Simulated` remains visible on the guest portfolio, narrative front, and evidence back, including a screenshot cropped to the primary result.
- The visible seed or scenario identifier and simulated-whitelist version reproduce the same guest snapshot; selection cannot introduce assets or values outside the versioned whitelist.
- The implemented theme front and canonical rational representation use identical snapshot inputs, evidence, calculation outputs, coverage, and directional guidance. Phase 0 does not require runtime switching between multiple theme variants.
- The evidence back identifies the snapshot time, evidence cutoff, at least one dated evidence item, the derivation of the main claim, assumptions, and a risk notice.
- A forced market-data failure produces a limited or unavailable analysis that names the missing evidence and never displays a fabricated current value.
- Phase 0 passes without requiring a model call. If a model is used, its failure cannot produce a normal card.
- The same entry route works when opened from a QR code, an NFC URL handoff, and a normal link; a lack of NFC support does not block use.

### 7.2 MVP Acceptance

- A real user can create two source accounts and can tell from the UI that neither is institution-verified or live-synchronized.
- A user can manually create, edit, reject, and confirm a holding row; only the confirmed version enters a snapshot.
- A representative screenshot containing several holdings creates reviewable drafts rather than confirmed holdings. At least one intentionally ambiguous field remains unresolved until the user acts.
- Every confirmed row displays its source account, entry method, observation date, and confirmation state; correcting an extracted field is reflected in provenance.
- Failed or partial screenshot extraction leaves manual entry available and preserves recoverable work.
- A portfolio snapshot freezes confirmed holding versions and all four constraints. Changing one holding or constraint does not mutate an existing card and instead produces a new snapshot path.
- Entering `unknown` for any minimum constraint is allowed and causes any dependent conclusion to be narrowed or withheld.
- Unsupported and unvalued holdings remain visible in snapshot coverage and cannot disappear from the denominator without disclosure.
- The market-data adapter returns source locator/class, observation and retrieval timestamps, normalization and identity evidence, and typed failure/staleness states under a documented per-measure freshness policy. Credential-free contract tests demonstrate available, stale, ambiguous, unsupported, rate-limited, failed, revised, and contradictory outcomes without binding the analysis layer to one vendor.
- For identical snapshot and evidence inputs, theme changes do not change rational conclusions or directional guidance.
- Every material statement on the narrative front can be traced from the evidence back to confirmed inputs, a derived result, or dated evidence; generated interpretation is labeled distinctly.
- Observed, derived, and generated content is distinguishable. Any model-assisted path validates a named schema/version and proves timeout, malformed-output, bounded-retry, redaction, disclosure, and no-normal-card-on-failure behavior.
- A target novice can explain the holding-linked concept conveyed by the themed narrative in plain language after reading the card, while a comparison of rational outputs confirms that the explanation did not change the conclusion. This requires observable comprehension evidence, not a mandatory formal user study.
- Directional guidance names its triggering constraint/evidence and never creates or submits a transaction.
- When material evidence is missing, the card states affected scope and recovery steps. When no conclusion is supportable, the result is `analysis unavailable`, not a normal card.
- Private portfolio/card routes do not reveal content to an unauthenticated visitor, public search preview, or possession of the generic QR/NFC entry URL.
- Raw screenshots, account identifiers, and full portfolio payloads are absent from public assets and default application logs in a verification run.
- The user can request deletion, receive a visible outcome, and no longer access deleted workspace data through normal product routes, subject to any explicitly disclosed retention exception.
- The complete real-user path is operable at 375px using touch and keyboard alternatives, with no essential action dependent on hover, animation, NFC, QR, camera, or screenshot extraction.

## 8. Explicit Non-Goals

- Brokerage connectivity, account verification, custody, payments, or transaction execution.
- Automatic trading, automatic rebalancing, exact buy/sell order instructions, or guaranteed returns.
- Comprehensive financial planning, suitability determination, credit assessment, insurance, tax, legal, or fiduciary advice.
- Prediction of short-term prices or claims of market-beating performance.
- Complete coverage of every asset, exchange, currency, jurisdiction, or data entitlement.
- Treating screenshot extraction, model output, or a user-named source account as verified truth.
- Hiding uncertainty behind a single confidence score or a persuasive themed narrative.
- Active Query in the MVP or first-version completion contract.
- Social/public portfolio sharing by default.
- Native mobile installation or dependence on custom NFC hardware.
- Selecting an exact AI model, framework, market-data provider, storage engine, authentication API, or protocol before those implementation contracts are confirmed.

## 9. MVP Completion Evidence

The delivery record should include:

- a screen recording of the guest tracer bullet and the real-user flow on a mobile viewport;
- screenshots of manual and screenshot-assisted rows before and after confirmation;
- one snapshot/version transition demonstrating that an old card remains bound to its old inputs;
- one normal card and one limited/unavailable card with their evidence backs;
- adapter contract-test results covering typed availability and failure states;
- model-path contract results when a model is used, including schema/version validation, redaction, disclosure, timeout, malformed output, retry, and unavailable-state evidence;
- a privacy verification showing public routes, logs, and share previews do not expose private inputs;
- QR, NFC URL handoff, ordinary-link, keyboard, and narrow-screen checks;
- a short claim-to-evidence audit for every material statement on the demonstrated card.
- documented local reproduction without Qoder and redacted evidence that Qoder was used for the competition build.

The MVP is not accepted solely because a themed card can be generated. Acceptance requires the full observable chain from user-confirmed inputs and constraints to versioned evidence, bounded guidance, truthful degradation, and recovery.
