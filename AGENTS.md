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
- 默认 `stream` 分析只调用一次模型；同一次输出包含有边界的理性背面与人物正面，人物正文按快照主题加载定稿 persona skill。Markdown 标题实时投影为等待页进度，两个分区完整校验后才进入结果与历史。
- A2A 采用 HTTP+JSON 绑定与 ProtoJSON 对象形状；协议 `1.0.x` 对外协商值固定为 `1.0`，请求必须携带 `A2A-Version: 1.0`（缺失按 `0.3` 处理并拒绝）。
- A2A 结构化行情复用隔离的 PandaAI Python worker 与 SQLite 证据缓存；生产凭据只使用 `PANDA_DATA_USERNAME` / `PANDA_DATA_PASSWORD` 服务端环境变量，worker 子进程内再映射为 SDK 变量。
- `src/portfolio/`、`src/workspace/`、`src/history/`、`src/persistence/`：组合快照、匿名工作区、不可变历史、SQLite Store。
- 引导页随机体验持仓与数据管理页共用 `src/portfolio/random-example.ts` 的真实标的字典、方向性仓位和观察日期生成规则；“换一份”排除当前标的，避免原地重复。
- `src/atlas/`、`src/a2a/`、`src/model/`、`src/extraction/`：图鉴、独立 A2A 深度复盘、ModelGateway、截图提取。每次成功复盘的图鉴后置任务最多保存 4 张卡（最多 3 张报告相关专业概念，确定性 35% 概率追加 0-1 张场景梗）；新卡与复遇卡都通过 analysis outcome 回放。
- `src/theme/`：三主题共享目录与 persona 映射；客户端素材映射独立放在 `src/theme/client.ts`，服务端不得导入媒体资源。
- `deploy/`：单主机 Nginx/systemd 发布脚本。

## 红线

- 只给可追溯的方向性建议，不给精确金额、份额、价格、交易时点或收益保证。
- 原始截图提取后删除；截图、身份、账户信息、凭据不进模型输入、日志、历史或公开资源。
- 供应商密钥只存在服务端环境；测试用虚构、最小、标注的示例数据。
- 当前主题是工作区浏览器偏好，发起分析时必须由服务端写入不可变快照；历史报告按快照主题回放，不跟随当前偏好变化。
