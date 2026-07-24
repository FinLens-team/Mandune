# ADR-0008: Technical Baseline for Demo V1 Scaffold

- Status: Accepted
- Date: 2026-07-24
- Ticket: #23 / MD-001

## Context

满懂（Mandong）Demo V1 需要可安装、可检查、可测试、可构建的仓库基线，以便后续纵向切片在同一技术面上交付。ADR-0004 至 ADR-0007 已接受分析管线、PandaAI 上游、OpenAI-compatible `ModelGateway` 与 Vercel AI SDK Core 运行时，但尚未锁定前端壳、HTTP 服务、共享契约包、测试与 CI 的工程基线。

旧 ADR-0001 至 0003 已删除；其中提出的 Vite/Fastify 组合从未被接受，不能约束本决策。公开托管与部署形态由 #35 决定；匿名工作区持久化与定位由 #26 决定。本 ADR 只为 #23 脚手架与后续实现选择可替换、可本地运行的基线，不引入业务逻辑、持仓分析或供应商生产验收。

## Decision

接受以下 Demo V1 工程基线。脚手架与后续切片必须遵守；超出本基线的框架、存储引擎或托管 API 须另开 ADR 或票据。

1. **Repository layout**：仓库根使用单包 pnpm 项目，前后端与共享契约分别位于 `src/client`、`src/server` 和 `src/contracts`。Demo V1 当前没有多个可独立发布的包，不提前引入 workspace。
2. **Language**：端到端 TypeScript。
3. **Web**：`src/client` 使用 Vite + React + TypeScript SPA。UI 壳可替换；不采用 Next.js。ADR-0007 已明确模型 SDK 不要求 Next.js 或 Vercel Hosting。
4. **Server**：`src/server` 使用 Hono，运行于 Node。HTTP 面保持小型；后续 OpenAI-compatible 网关与服务端适配器落在此边界。不采用从未接受的 Fastify 基线。
5. **Contracts**：`src/contracts` 提供框架中立的共享类型与占位；核心分析类型不得导入 UI 或供应商 SDK。
6. **Storage（本票基线）**：尚无耐久私人存储。匿名工作区持久化推迟到 #26；#23 脚手架仅使用进程内 / 内存级健康与占位，不为生产选定 SQLite、Postgres 或 Redis。
7. **Anonymous workspace locator**：推迟到 #26。基线仅要求服务在缺少密钥或必需配置时 fail closed，且不泄露配置值。
8. **Test**：Vitest 承担单元与集成测试；#23 仅要求 Vitest smoke。浏览器 E2E（Playwright 等）推迟到后续票据。
9. **CI**：GitHub Actions 在 PR/push 上执行 install、typecheck/lint、test、build。
10. **Config**：仅提交 `.env.example`；不提交真实密钥。缺少必需配置时 fail closed，错误信息不泄露密钥值。
11. **Deploy**：容器或静态托管选择推迟到 #35。脚手架必须产出可在本地运行的 `build` 产物。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| Next.js 全栈 | 拒绝。会把路由、托管与模型运行时隐式绑在一起；与 ADR-0007「不要求 Next/Vercel Hosting」冲突，且抬高 Demo V1 替换成本。 |
| Fastify 服务端 | 拒绝。旧未接受基线；Hono 更轻、类型友好，足以支撑小型 HTTP 与后续网关适配。 |
| NestJS | 拒绝。模块与 DI 重量超出当前串行分析与小型 HTTP 面需求。 |
| 纯静态前端、无服务端 | 拒绝。模型密钥、供应商凭据与 fail-closed 配置必须留在服务边界，不能进入浏览器。 |
| pnpm workspace monorepo | 推迟。当前只有一个可部署应用，单包目录已经能隔离 client、server 和 contracts；提前拆包会增加构建、依赖与锁文件维护成本。 |

## Consequences

- #23 脚手架可按本 ADR 落地单包 client、server、contracts、Vitest smoke 与 CI，而不锁定存储或部署供应商。
- 后续 #26 可在不推翻 web/server/contracts 边界的前提下引入匿名工作区定位与持久化。
- 后续 #35 可在本地 `build` 产物之上选择容器或静态托管，而不回写本基线。
- 分析契约与模型边界继续由 ADR-0004 至 0007 约束；本 ADR 不改变产品不变量或证据/生成分层。
- 实现完成声明仍须指向最终分支与实际 install/check/test/build 验证；文档本身不等于运行事实。

## References

- [`PRODUCT.md`](../../PRODUCT.md)
- [`docs/specs/demo-v1.md`](../specs/demo-v1.md)
- [`docs/specs/analysis-contract.md`](../specs/analysis-contract.md)
- ADR-0004、ADR-0005、ADR-0006、ADR-0007
- GitHub Issue #23 / MD-001
- 相关后续：#26（匿名工作区）、#35（公开托管）
