# 满懂 Agent Guide

本项目不再文档驱动：没有 spec、ADR、Issue 流程。代码和测试是唯一事实来源，本文件只记录经验证的硬事实，由 Agent 在工作后自动维护（新增/修正模块职责、命令、非显然限制；不记录过程、猜测或凭据）。

## 工作流

- 用户直接在对话中提需求，Agent 直接改码；每个对话只做用户分派的范围，范围外问题只汇报不动手。
- 直接在 `main` 上开发：原子化提交后立即 `git push` 远端，不走分支/PR/Issue。
- 同步上游用 `git fetch origin && git rebase origin/main`，不用 merge commit。
- 提交信息由 `.githooks/commit-msg` 校验：首行必须是 Conventional Commit `<type>(<scope>): <中文主题>`（type 限 feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert），主题后一个真实空行，正文必须包含中文（可混英文术语）。首次克隆执行 `git config core.hooksPath .githooks` 启用。

## 技术基线

- 单包 pnpm 项目：Node `>=22 <23`、pnpm `10.33.2`、ESM、严格 TypeScript。不建 workspace 或 `apps/`、`packages/` 布局。
- 客户端 Vite + React，服务端 Hono（Node），测试 Vitest，持久化 Node 22 内置 `node:sqlite`（迁移在 `migrations/` 按编号执行）。
- 模型接入走 OpenAI-compatible 网关（Vercel AI SDK Core）；模型与供应商配置不得进入 `VITE_*`、浏览器包、日志或 `/health`。

## 命令

```sh
pnpm install --frozen-lockfile
pnpm check        # typecheck + lint
pnpm test
pnpm dev          # Vite 客户端
pnpm dev:server   # 服务端观察进程
pnpm build        # dist/client + dist/server
pnpm start        # 默认 127.0.0.1:8787
```

## 模块地图

- `src/client/`、`src/client/ui/`：React 单页壳与共享 UI 原语。
- `src/features/`：按功能分片的前端界面（onboarding、review、atlas、workspace-shell 等）。
- `src/server/`：Hono HTTP 边界，静态资源与 SPA fallback。
- `src/contracts/`：框架中立的版本化契约与纯校验器，不得导入 React、Hono 或供应商 SDK。
- `src/analysis/`：确定性派生、ReviewPacket、Prompt 编译、结果校验与单 agent 编排。
- `src/portfolio/`、`src/workspace/`、`src/history/`、`src/persistence/`：组合快照、匿名工作区、不可变历史、SQLite Store。
- `src/atlas/`、`src/a2a/`、`src/model/`、`src/extraction/`：图鉴、独立 A2A 深度复盘、ModelGateway、截图提取。
- `deploy/`：单主机 Nginx/systemd 发布脚本。

## 红线

- 只给可追溯的方向性建议，不给精确金额、份额、价格、交易时点或收益保证。
- 原始截图提取后删除；截图、身份、账户信息、凭据不进模型输入、日志、历史或公开资源。
- 供应商密钥只存在服务端环境；测试用虚构、最小、标注的示例数据。
