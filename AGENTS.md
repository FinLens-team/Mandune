# 满懂 Agent Guide

## 必读上下文

任何 Agent 在规划、创建 Issue、修改或评审前，必须依次阅读：

1. [`PRODUCT.md`](PRODUCT.md)
2. [`CONTEXT.md`](CONTEXT.md)
3. [`DESIGN.md`](DESIGN.md)
4. [`docs/specs/demo-v1.md`](docs/specs/demo-v1.md)
5. [`docs/specs/analysis-contract.md`](docs/specs/analysis-contract.md)
6. [`docs/integrations/pandaai-bocha.md`](docs/integrations/pandaai-bocha.md)
7. [`docs/decisions/`](docs/decisions/) 下所有状态为 `Accepted` 的 ADR（如有）
8. 当前工作目录中更近的 `AGENTS.md`（如有）

比赛材料、演示或提交相关工作还必须阅读 [`docs/competition/`](docs/competition/)；用户研究相关工作还必须阅读 [`docs/research/target-user-evidence.md`](docs/research/target-user-evidence.md)。

不要根据任务标题补造业务规则。若任务与契约冲突，停止受影响边界并记录冲突；改变产品行为先更新规格，难以逆转或反直觉的技术权衡用 ADR 记录。

## 当前仓库状态

- 仓库是单包 pnpm 项目，使用 Node `>=22 <23`、pnpm `10.33.2`、ESM 与严格 TypeScript。应用代码位于 `src/`，构建产物位于 `dist/`；不要创建 pnpm workspace 或 `apps/`、`packages/` 布局。
- 当前接受的 ADR 为 0004-0009：确定性串行分析管线、PandaAI 初始结构化数据上游、OpenAI-compatible `ModelGateway`、Vercel AI SDK Core 初始模型运行时、Vite + React/Hono/Vitest 单包工程基线，以及 Node 22 `node:sqlite` 单机耐久状态。旧 0001-0003 已退出当前契约。
- ADR-0009 已完成 ADR-0008 推迟的耐久私人存储选择；公开部署仍由 #35 决定。PandaAI/Bocha 的供应商接入与运行验收仍是 #24 及后续票据的独立范围。
- PandaAI 已通过脱敏 credentialed spike 验证代表性 A 股和 ETF 历史路径；Bocha 与 PandaAI 的完整方法、资产矩阵、限流、修订和生产运行验收仍需按集成文档完成。方法名、文档示例或申请状态不能替代真实权限与响应证据。
- `src/analysis/validation.ts` 接受契约允许的 date-only 市场观察日，只在调用旧共享校验器的副本中规范化为 UTC 零点；最终 `AnalysisResult` 必须保留供应商原始日期精度。
- 分支 `archive/qoder-interrupted-20260724` 的 commit `8c57fad` 是未验证的中断 Qoder 产物，不得当作已接受实现或完成证据。

## 已接受的技术决策

- ADR-0004 规定确定性证据、派生和串行模型分析先后顺序；主题只消费同一份已校验的理性分析，不能改变证据、结论或建议。
- ADR-0005 选择 PandaAI 作为初始真实结构化数据上游；A 股和 ETF 代表性路径已验证，场外基金和完整生产矩阵仍保持明确的未知/待验收状态。
- ADR-0006 规定框架中立的 OpenAI-compatible `ModelGateway`；structured output、streaming、multimodal 和 tools 必须逐项 capability-test。
- ADR-0007 选择服务端 Vercel AI SDK Core 与 `@ai-sdk/openai-compatible`；每日复盘仍由应用层编排，不引入自主 Agent loop。
- ADR-0008 选择 Vite + React + TypeScript 客户端、Hono Node 服务、Vitest 与 GitHub Actions CI 的单包基线；`src/contracts` 必须保持框架和供应商中立。
- ADR-0009 选择 Node 22 内置 `node:sqlite` 作为单进程、低并发 Demo 的耐久 Store；WAL/FK/迁移或完整性检查失败时生产启动必须 fail closed，不得回退 Memory。

## 交付规则

- 使用 GitHub Issues 交付纵向切片；每个 Issue 写明依赖、场景、范围、非目标、正常/降级验收和证据。
- 只实现当前 Issue。发现相邻工作时创建或补充后续票据，不顺手扩大范围。
- 优先让一个用户结果端到端可观察，再扩展覆盖、供应商、Agent 或表现层。
- 未经契约或 ADR 确认，不选择难以替换的框架、模型供应商、存储引擎、认证协议或部署 API。
- 文档中的计划、fixture 和供应商资料不等于运行事实。完成声明必须指向最终分支和实际验证。

## Issue 自助认领

- 只认领带 `status:ready` 且无 assignee 的 Issue；`status:blocked` 必须等维护者解除依赖。
- 认领前按正文评论 `CLAIM`，随后自分配并移除 `status:ready`。一票一 owner，一票一主分支和主 PR。
- 分支使用 `issue/<编号>-<slug>`，PR 正文使用 `Closes #<编号>`。当前套餐不能强制保护 `main`，严禁直推 `main`。
- 只修改正文声明的独占路径和已协调共享路径。公共 schema、lockfile、全局 tokens、部署配置和根指导文档按 Issue owner 串行修改。
- 每 24 小时留下可验证进展；释放时评论 `HANDOFF`，说明 commit/PR、验证、已触碰文件、未完成项和阻塞，再取消分配。
- 前置 PR 合并并关闭不自动代表下游可认领；维护者核对全部依赖和文件冲突后，才把 `status:blocked` 改为 `status:ready`。

## 产品不变量

- 满懂只提供可追溯的方向性建议，不提供精确金额、份额、比例、价格、交易时点、收益保证、代客操作或持牌意见暗示。
- 每项物质性结论必须引用确认输入、可复算派生结果或已核验的带时点证据；`observed`、`derived` 和 `generated` 保持可区分。
- 缺失、过期、含糊、冲突、不支持、限流、失败或无法核验的数据保持未知，并触发 `limited`、`observation_only` 或 `unavailable`；不得伪造当前值或正常长笺。
- 四项个人约束都允许 `unknown/not decided`，不得使用默认值冒充用户选择。
- 截图和手工输入先形成草稿；只有用户确认的行进入不可变组合快照。Demo 主路径可为随机体验身份，须全程标注体验数据。
- 主题叙事正面与理性证据背面使用同一版本的快照、证据、结论和建议。
- 主题与吉祥物只改变表达；东方观象吉祥物为兜兜，其它主题可有独立吉祥物。不得改变数据、证据选择、计算、覆盖、风险判断或方向性建议。
- 证据充分性、Agent 数量或运行阶段不表示未来市场结果概率，也不能显示为预测置信度。
- Demo 分析默认单 agent 串行阶段，不得用纯计时器伪造进度。
- 主动查询、连续追问和聊天式投资问答不属于 Demo V1，不得加入现有接口、验收或票据。

## 供应商与模型隐私

- 原始截图在提取成功、失败或中止后删除，不进入历史、分析证据、默认日志、分析事件、公开资源或测试快照。
- 模型只接收用户确认的完整结构化持仓、四项约束、规范化证据、派生结果和输出边界。原始截图、身份、联系方式、账户名称或号码、工作区访问凭据、供应商密钥和无关截图文字不得进入模型输入。
- 完整私人持仓不得进入公开页面、URL、默认日志、分析事件、演示 fixture 或公开 Issue 附件。测试使用虚构、最小、明确标注的数据。
- PandaAI 凭据只存在于受保护的服务边界。每个方法和资产类型分别验收权限、字段、单位、观察时间、获取时间、空值、限流与错误。
- Bocha 查询使用最小必要范围，不发送完整持仓金额、约束、身份、账户信息或访问凭据。搜索标题和摘要只是候选线索；物质性结论必须回到可定位的权威一手来源核验。
- 模型输出必须经过版本化结构和内容边界校验。畸形、缺证、越界或正反面冲突的输出不可展示；有限重试后降级，不显示部分生成文本。

## 验证

- 以 [`docs/specs/demo-v1.md`](docs/specs/demo-v1.md) 的可观察行为和 [`docs/specs/analysis-contract.md`](docs/specs/analysis-contract.md) 的状态矩阵为验收依据。
- 核心流程覆盖桌面和 375px 触控视口，并提供不依赖 hover、动画、截图上传或横向手势的完整替代路径。
- 同时验证正常、有限、仅观察、不可用和恢复路径；硬截止后不得留下仍运行的供应商或生成任务。
- 供应商测试覆盖鉴权、可用、过期、含糊、不支持、冲突、限流、空结果、超时和失败，并检查日志不含凭据或私人组合载荷。
- 主题对照必须证明证据、派生结果、覆盖、风险和建议一致。单 agent 分析等待态必须来自真实任务，不按计时器伪造。
- 比赛完成声明只使用最终分支、浏览器验收和脱敏协作证据。Qoder 记录不能替代产品验证。

## 命令

已验证的本地命令：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm test:smoke
pnpm build
pnpm start
pnpm maintenance:purge
```

`pnpm dev` 启动 Vite 客户端，`pnpm dev:server` 运行服务端观察进程。`pnpm build` 生成 `dist/client` 和 `dist/server`，`pnpm start` 默认监听 `HOST=127.0.0.1`、`PORT=8787`，并在绑定端口前打开 `MANDONG_DB_PATH`（默认 `/var/lib/mandong/mandong.sqlite3`）和执行迁移；父目录须预先存在且仅服务用户可访问。启动不需要 `MODEL_*` 或供应商凭据；模型和供应商配置只能由后续服务端边界读取，不能进入 `VITE_*`、浏览器包、日志或 `/health`。过期清理只运行本地 `pnpm maintenance:purge`，不提供公开 purge route。

Node 服务关闭 request timeout，并将 headers timeout 设为 210 秒，确保不早于产品的 180 秒应用级分析截止截断请求；反向代理/部署 timeout 仍由 #35 决定。

## 模块地图

- `src/client/`：Vite + React 单页壳。必须保持桌面与 375px 触控视口可读、可键盘访问，不用悬停、动画或图片上传作为完成路径。
- `src/client/ui/`：共享可访问 UI 原语与组件样式；按钮、体验/锁定徽章、图标按钮和分析状态应复用此边界，不在功能页面重复实现。
- `src/portfolio/`：草稿、可用性判定、批量确认保护与不可变快照创建。
- `src/workspace/`：匿名私密工作区生命周期、opaque locator 与 TTL 清理。
- `src/history/`：append-only 不可变复盘历史与只读重放；未知版本不会调用当前供应商重算。
- `src/persistence/`：`node:sqlite` Store 适配器、生产组合与本地维护 CLI。生产数据库失败不得回退 Memory。
- `migrations/`：按编号执行的 SQLite schema；迁移 SQL 与对应 `PRAGMA user_version` 在同一 `BEGIN IMMEDIATE` 事务提交。
- `src/features/review/` 与 `src/features/constraints/`：单页复核与四项约束 UI。
- `docs/design/demo-v1-visual-system.md`：S0-S10 的唯一视觉、响应式、动效与无障碍实现基准。
- `src/extraction/` 与 `src/features/screenshot-import/`：截图知情同意、多模态草稿提取与原图删除保证。
- `src/server/`：Hono Node HTTP 边界。`GET /health` 只能返回安全 liveness 字段；生产服务从 `dist/client` 提供静态资源并对文档请求执行 SPA fallback。
- `src/analysis/`：确定性派生、四状态矩阵、八阶段单 agent 编排、真实 `TaskEvent`、有限重试、取消、180 秒硬截止与迟到响应隔离。
- `src/model/`：框架中立 `ModelGateway` 与服务端 OpenAI-compatible AI SDK 适配器；不承载自主 Agent loop、供应商凭据日志或 UI 类型。
- `src/contracts/`：框架中立的版本化契约与纯校验器（`CONTRACTS_VERSION`）。不得导入 React、Hono、模型 SDK 或供应商 SDK。
- `src/fixtures/`：确定性示例 fixture 与重放/hash 工具；必须标注示例，不得存入真实或完整私人持仓，不得称为供应商缓存。
- `tests/contracts/`：契约、建议边界、隐私扫描与 fixture 状态矩阵测试。
- `pnpm-lock.yaml`、根 `package.json`、`tsconfig*.json`、`vite.config.ts`、`vitest.config.ts`、`eslint.config.js` 与 `.github/workflows/ci.yml`：全局工程边界，后续改动需与当前 Issue owner 协调。

仓库提交信息由 `.githooks/commit-msg` 校验；首次克隆后执行 `git config core.hooksPath .githooks` 启用。主题和正文必须包含中文但允许混用英文术语，正文格式和长度不作限制；主题后使用真实空行，不得使用字面量 `\\n`。PowerShell 执行 `powershell -ExecutionPolicy Bypass -File .githooks/test-commit-msg.ps1`，POSIX shell 执行 `sh .githooks/test-commit-msg.sh`，可离线验证 Hook。

本项目同步上游时以 `origin/main` 为基线：先执行 `git fetch origin`，再使用 `git rebase origin/main` 将本地提交放到最新上游之后；冲突按当前产品契约逐文件解决并完成验证，不使用 merge commit 作为日常同步方式。

## 持久知识

工作结束后，把源码和测试证实的架构、约定、命令、模块职责和非显然限制写入根或最近目录的 `AGENTS.md`。产品规则写入 `PRODUCT.md` 或规格，领域术语写入 `CONTEXT.md`，设计规则写入 `DESIGN.md`，难以逆转的技术决策写入 ADR，执行工作写入 Issue。不要记录会话过程、临时状态、凭据或未经验证的猜测。
