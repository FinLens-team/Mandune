# ADR-0003: Select the Phase 0 Technical and Deployment Baseline

- Status: Proposed
- Date: 2026-07-24
- Ticket: FNL-000

## Context

Phase 0 需要交付一个公开、移动优先的访客 tracer bullet：评审者从普通 HTTPS 链接、二维码或 NFC 进入同一入口，选择模拟体验，读到一张可追溯证据的每日分析卡，并能观察市场证据失败时的诚实降级。

`PRODUCT.md` 与 `docs/specs/mvp.md` 只定义可观察行为，刻意不选择框架、模型供应商、市场数据供应商、存储引擎、认证协议或部署 API。FNL-000 需要在实现 FNL-001 前选择一个最小、可复现、可替换的技术与部署基线。

本次决策增加两个已确认约束：交付形态是 Web 网站；默认部署目标是当前开发主机，并通过自有域名公网访问。该主机已经由宝塔 Nginx 占用 80/443，现有站点使用 Nginx 终止 TLS 后反向代理到 loopback 服务，证书由现有 Certbot 续期链管理。另起一个默认占用 80/443 的代理会与现有入口冲突。

Phase 0 只使用版本化模拟白名单、可见种子或场景标识和确定性市场 fixture。它不需要模型调用、真实金融数据、认证、持久化金融存储或长期应用密钥。本 ADR 不选择这些后续能力的供应商或协议。

## Decision Drivers

候选方案按 FNL-000 的同一组维度比较：

- 交付速度；
- 375px 触控视口和当前移动浏览器支持；
- 确定性正常/失败 fixture 的单元、契约和端到端可测试性；
- 本机 HTTPS 部署、进程隔离和可验证回滚；
- 浏览器包、服务端凭据和日志的密钥暴露面；
- 仅凭仓库命令脱离 Qoder 复现的能力；
- 替换市场适配器、分析和表现实现的迁移成本。

比较为 Phase 0 范围内的定性判断，不声称存在尚未执行的性能或交付工时数据。

## Considered Baselines

### Baseline A (recommended): Vite + React + TypeScript + thin Fastify service

- Vite 构建 React + TypeScript SPA；Fastify 在生产中提供静态产物和极薄的 `/api`/health 边界。
- Phase 0 的 `MarketAdapter` 使用确定性 fixture，不访问真实供应商。
- Vitest 验证纯 TypeScript 领域契约和 adapter 状态；Fastify `inject()` 验证 HTTP schema、正常/失败响应和日志；Playwright 验证 375px、触控/键盘和公开访客闭环。
- 一个 Fastify systemd 服务只监听 `127.0.0.1:<reserved-port>`；现有 Nginx/Certbot 负责域名、80 到 443 跳转和 TLS。

### Baseline B: Next.js App Router self-hosting

- Next.js 同时提供 React 页面和 Route Handlers，由 `next start` 运行在 loopback，前置同一套 Nginx/Certbot。
- 使用相同的 Vitest 与 Playwright 验收基线。
- 自托管技术上可行，也能保持服务端环境变量不进入客户端；但 Phase 0 没有 SSR、RSC、ISR 或 Server Actions 需求。若将契约放进 Route Handlers 或 Server Components，后续实现更容易依附 Next.js 的路由、缓存和运行时约定。

### Baseline C: Vite static-only site behind Nginx

- Nginx 直接服务 Vite 静态产物，所有 Phase 0 fixture 和分析在浏览器内运行。
- 这是 Phase 0 最少进程、最快的可行方案。
- 它没有可承载未来市场供应商凭据的服务端边界；进入 FNL-005 时必须新增服务并迁移 adapter 调用路径，因此不作为连续演进的默认基线。

### Comparison

| Dimension | Baseline A: Vite + Fastify | Baseline B: Next.js | Baseline C: static-only |
|---|---|---|---|
| Delivery speed | Fast; one thin service must be wired | Fast; full-stack scaffold, with unused Phase 0 features | Fastest; no application server |
| Mobile/browser | High; client-rendered responsive route | High; SSR is available but unnecessary | High; same Vite client |
| Testability | High; pure contracts, `inject()`, and browser tests | High; route tests include Next runtime conventions | High for UI/contracts; no server boundary to test |
| Deployment/rollback | Simple; one loopback service plus immutable assets | Moderate; one service plus framework runtime/cache behavior | Simplest; immutable static assets only |
| Secret boundary | Clear server boundary; `VITE_*` remains public | Clear when server/client rules are followed | No application-side secret boundary |
| Qoder independence | High; ordinary npm scripts | High; ordinary npm scripts | High; ordinary npm scripts |
| Migration cost | Low if three contracts remain framework-neutral | Moderate if contracts enter Next-specific APIs | Deferred cost when a server adapter becomes necessary |

## Decision

Select **Baseline A: Vite + React + TypeScript SPA with a thin Fastify service**, deployed behind the host's **existing Nginx + Certbot** HTTPS entry.

Baseline A is not the fewest-component Phase 0 option; Baseline C is. The additional loopback service is accepted because it establishes the browser/server trust boundary and HTTP adapter contract needed by later tickets without adopting Next.js features that Phase 0 cannot observe. The core contracts must remain ordinary TypeScript and must not import React, Fastify, Nginx, or vendor-specific types.

This ADR remains `Proposed` until maintainer review accepts the decision. Changing it to `Accepted` will authorize FNL-001 to implement the selected baseline; it will not claim that the current documentation-only repository already runs it. Runtime evidence belongs to the implementing tickets and must not become a circular prerequisite for accepting this decision.

### Runtime and replacement boundaries

The implementation will expose three versioned, framework-neutral contracts:

- `MarketAdapter`: returns normalized observations with asset identity evidence, source locator or class, observation time, retrieval time, units, caveats, revision/conflict representation, and typed status.
- `Analysis`: maps one deterministic snapshot and evidence cutoff to claims, coverage, evidence sufficiency and directional guidance while distinguishing `observed`, `derived`, and `generated` content.
- `Presentation`: renders one themed narrative front and canonical rational evidence back from the same versioned analysis result.

Missing, stale, ambiguous, unsupported, rate-limited, failed, revised or conflicting evidence remains explicit. It may narrow the result to limited, observation-only or unavailable, but cannot produce a fabricated current value. Coverage and evidence sufficiency never represent market-outcome probability or a `high confidence` prediction.

Theme changes may affect only vocabulary, artwork, pacing and presentation. They cannot change evidence selection, calculations, coverage, risk classification or guidance. Every material narrative claim must map to a confirmed fixture input, a derived result or dated evidence.

The Phase 0 fixture contract must carry a simulated-whitelist version, visible seed or scenario identifier and persistent `Simulated` status. The same whitelist version and seed reproduce the same holdings and values; arbitrary random assets or values cannot enter the scenario.

### Runtime and test baseline

- Use Node 22.x and npm with a committed lockfile. The implementation must pin the supported Node range in repository metadata.
- Provide repository scripts for `npm run dev`, static checks, Vitest, Playwright, production build and production start; use `npm ci` for clean installation. `vite preview` is local preview only and is not the production server.
- `npm run dev` starts Vite HMR and the thin Fastify API together. Vite proxies `/api` to the loopback Fastify port so development preserves the production request boundary. Normal and forced-failure behavior is selected by a versioned, validated fixture scenario identifier that remains visible in the UI and cannot introduce arbitrary holdings or values.
- Vitest in FNL-001 covers deterministic seed selection, three contract boundaries, the normal fixture and forced adapter failure. The full adapter matrix (`stale`, `ambiguous`, `unsupported`, `rate-limited`, revisions and conflicts) remains owned by FNL-005.
- Fastify `inject()` covers HTTP schemas, normal and forced-failure fixtures, no fabricated values, health behavior and credential-free logs.
- Playwright covers a fresh 375px session, touch and keyboard paths, persistent `Simulated` labels, seed/version reproducibility, evidence traceability, risk notice, and limited/unavailable output after forced adapter failure.
- Ordinary link, decoded QR payload and NFC URL record must resolve to the same generic HTTPS entry and contain no personal financial data, credential, bearer token or sensitive parameter. The ordinary URL remains a complete fallback.

### HTTPS deployment on the current host

- Keep Nginx as the sole public listener on 80/443. Add an isolated domain vhost; port 80 only redirects to HTTPS, and port 443 proxies to the FinLens loopback service with the required forwarding headers.
- Bind Fastify only to `127.0.0.1:<reserved-port>`, run it under a dedicated low-privilege systemd identity, expose a non-sensitive health endpoint and use `Restart=on-failure`. Do not expose the application port through the public firewall.
- Configure a DNS-only A record for the selected domain. Add AAAA only after IPv6 routing and firewall behavior are verified. This ADR does not assume residential port forwarding, dynamic DNS, Cloudflare proxying or Cloudflare Tunnel.
- Reuse the installed Certbot tooling, timer and verified `dns-cloudflare` DNS-01 renewal approach, not an unrelated hostname certificate. After selecting the FinLens hostname, issue a dedicated or covering certificate through that DNS authenticator and verify renewal. DNS/ACME credentials and certificate keys remain outside this repository and are not copied into the application service. Do not use Certbot standalone mode because Nginx already owns 80/443.
- Deployment order is hostname and DNS, candidate loopback smoke test, matching certificate issuance through the verified DNS authenticator, TLS vhost installation, configuration test with the active `/www/server/nginx/sbin/nginx -t`, graceful Nginx reload, renewal check, then public HTTPS/redirect/normal/failure smoke tests.

### Release and rollback

Each production release is an immutable directory identified by commit SHA and accompanied by a build manifest or checksums. A `current` symlink identifies the active release; at least one previously verified release remains available.

A candidate is built and tested before activation. Activation switches `current`, restarts only the FinLens application service and verifies loopback health plus public HTTPS behavior. Failure switches `current` back to the previous release and restarts only FinLens. Application rollback does not modify Nginx or certificate state. Production rollback never uses `git checkout` against a mutable live working tree.

### Secret handling

- Phase 0 requires no application secret, real financial data or raw user screenshot.
- Values prefixed with `VITE_` are public build inputs because Vite replaces them into the client bundle; no secret may use that channel.
- Non-sensitive settings such as port and fixture mode may use environment variables. A later server credential decision must use a server-only mechanism such as systemd credentials or an equivalently protected root-owned file, and requires its own ticket/decision evidence.
- `.env`, certificate private keys, DNS credentials and vendor tokens remain untracked. Logs, fixtures, screenshots, recordings and Issue attachments must not contain credentials or complete private portfolio payloads.

### Qoder compatibility boundary

- Qoder may be used to author or build the competition entry, but no package, runtime import, build hook or deployment step may require Qoder.
- A clean checkout must install, check, test, build and start through documented npm commands on the pinned Node version without Qoder.
- Competition evidence records only the necessary version, command, exit status and redacted visual proof. Before storage or attachment, remove credentials, environment values, personal data and unnecessary local paths.

## Consequences

- Phase 0 maintains one additional Fastify/systemd service in exchange for an explicit browser/server boundary and a replaceable adapter HTTP surface.
- Reusing Nginx and Certbot avoids a second public proxy, duplicate certificate state and conflict on 80/443.
- The host and domain remain deployment dependencies. DNS, certificate issuance, loopback health and public HTTPS must be verified rather than assumed.
- This decision does not select a market-data vendor, model, storage engine, authentication mechanism or final production architecture. Later needs can replace implementations behind the contracts or reopen this ADR when the replacement boundary is insufficient.

## Decision Acceptance and Follow-on Evidence

The decision may move from `Proposed` to `Accepted` after maintainer review confirms the comparison, selected host topology, replacement boundaries, command contract, deployment/rollback design, secret boundary and Qoder boundary in this ADR. Acceptance records a technical choice; it does not assert that application or deployment tests already pass.

Implementation evidence remains blocking for the ticket that owns it:

| Evidence | Owner |
|---|---|
| Accepted comparison across delivery, mobile/browser, tests, deployment/rollback, secrets, Qoder and migration | FNL-000 / this ADR |
| Committed scripts, lockfile, framework-neutral contracts and normal/forced-failure fixtures | FNL-001 |
| 375px guest flow, public HTTPS, QR/NFC/ordinary-link equivalence and rollback exercise | FNL-001 |
| Full typed market-adapter state, freshness, revision and conflict matrix | FNL-005 |
| Clean build/test/start without Qoder, redacted Qoder evidence and privacy audit | FNL-001 initially; consolidated by FNL-010 |
| README and nearest AGENTS.md list commands that actually exist | The ticket that introduces or changes those commands |

While the status is `Proposed`, FNL-001 must not treat the selection as binding. Once the status is `Accepted`, FNL-001 may start and must produce its assigned evidence; absence of downstream implementation evidence does not revert the decision to `Proposed`.

## Rejected Alternatives

### Add Caddy as a second public proxy on this host

Caddy is a viable greenfield option and its automatic HTTPS is useful when it owns 80/443. On this host those ports and certificate renewal are already owned by a working Nginx/Certbot topology. Replacing Nginx would affect unrelated sites; putting Caddy behind Nginx would retain Nginx while adding another proxy and certificate/configuration surface. Neither change is justified by Phase 0.

### Use a hosted serverless platform as the default

Vercel, Netlify and similar platforms are technically viable, but they conflict with the confirmed default of deploying on the current host and introduce a provider runtime that FNL-000 has not evaluated. A later backup deployment can be decided separately.

### Use the static-only baseline

It is the smallest Phase 0 deployment, but it defers the server trust boundary and forces adapter transport to move when protected vendor credentials become necessary. The selected thin service accepts a small immediate cost to avoid that migration.

### Use Next.js for Phase 0

Next.js self-hosting is viable and does not inherently expose server secrets. It is not selected because Phase 0 has no observable need for its server-rendering, React Server Component, caching or Server Action features. This decision can be revisited if a later ticket demonstrates such a requirement.

## References

- Vite static deployment and production warning for `vite preview`: https://vite.dev/guide/static-deploy.html
- Vite environment variables and client exposure: https://vite.dev/guide/env-and-mode.html
- Vite backend integration: https://vite.dev/guide/backend-integration.html
- Fastify production recommendations: https://fastify.dev/docs/latest/Guides/Recommendations/
- Fastify testing with `inject()`: https://fastify.dev/docs/latest/Guides/Testing/
- Next.js self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- Nginx proxy module: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- Certbot certificate renewal: https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates
- Caddy automatic HTTPS: https://caddyserver.com/docs/automatic-https
- systemd service credentials: https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Credentials
