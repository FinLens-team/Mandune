# Contributing to Mandune

Mandune is an early-stage financial-information project. Small, evidence-backed changes are easier to review than broad rewrites, especially when they touch model output, private data, historical records, or deployment recovery.

## Before You Start

- Search existing issues before opening a new one.
- Use the bug or feature-request template for changes that need discussion.
- Do not post credentials, real portfolios, account screenshots, cookies, provider payloads, or private logs.
- For a security issue, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
- Changes to financial guidance must preserve the product boundary: no exact trade amount, allocation, price, timing, return promise, or automatic execution.

## Development Setup

Requirements:

- Node.js `>=22 <23`
- pnpm `10.33.2`

```sh
git clone https://github.com/FinLens-team/Mandune.git
cd Mandune
pnpm install --frozen-lockfile
mkdir -p .localdata
cp .env.example .env
```

Set `MANDONG_DB_PATH` in `.env` to an absolute path under `.localdata`. The deterministic fixture path does not require model or provider credentials.

```sh
pnpm dev:server
pnpm dev
```

## Change Guidelines

### Contracts and Privacy

- Keep `src/contracts/` independent from React, Hono, and provider SDKs.
- Validate external data at module boundaries; do not let provider payload shapes leak across the application.
- Keep secrets on the server. Never add credential configuration to `VITE_*`.
- Use fictional, minimal, visibly labeled data in tests and screenshots.
- Preserve fail-closed behavior when a result, history version, or evidence boundary cannot be validated.

### Reports and Financial Language

- Separate deterministic derivations from model-authored explanation.
- Preserve evidence timestamps, coverage, unknowns, and limitations.
- A theme may change wording, not rational conclusions.
- Do not turn missing evidence into a recommendation.
- Keep the fixed risk notice outside model control.

### User Interface

- Preserve keyboard navigation, focus management, reduced-motion behavior, and mobile layout.
- Use the established feature slices and UI primitives before adding a new abstraction.
- New visual assets need a recorded source, permission basis, and alt-text decision.

## Tests

Run the checks that match your change and include the results in the pull request:

```sh
pnpm check
pnpm test
pnpm build
```

For public-flow or responsive changes, run Playwright against an explicit candidate origin:

```sh
E2E_TARGET_URL=https://candidate.example.com \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
pnpm test:e2e
```

Deployment changes must also pass:

```sh
./deploy/validate.sh
```

## Pull Requests

1. Fork the repository and create a focused branch.
2. Keep generated output, local databases, `.env`, logs, and test artifacts out of the commit.
3. Use a Conventional Commit-style title such as `fix(history): preserve replay cutoff`.
4. Explain the user-visible change, risk boundary, and verification evidence.
5. Confirm that any new assets can be distributed and document their provenance.

By submitting a contribution, you agree that it may be distributed under the repository's Apache License 2.0. Mark material that is not intended as a contribution explicitly and do not attach third-party content without permission.
