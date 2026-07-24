# FinLens Agent Guide

## Required Context

任何 Agent 在规划、修改代码、创建 Issue 或评审前，必须依次阅读：

1. `PRODUCT.md`
2. `CONTEXT.md`
3. `docs/specs/mvp.md`
4. `docs/decisions/` 下所有已接受 ADR
5. 当前工作涉及目录中更近的 `AGENTS.md`（如有）

不要凭任务标题推断业务规则。若任务与上述契约冲突，停止受影响边界并在 Issue 中记录冲突；产品行为改变必须先更新规格，难以逆转或反直觉的权衡必须用 ADR 记录。

## Delivery Order

- 先完成 `FNL-000` 的 Phase 0 技术与部署 ADR，再交付公开访客 tracer bullet，最后扩展真实用户流程。
- 使用 GitHub Issues 作为实现票据。每个 Issue 必须写明依赖、范围、非目标和可观察验收条件。
- 优先交付端到端纵向增量，避免分别堆积没有用户闭环的前端、数据层或模型层。
- 不得选择产品契约尚未确认的框架、模型供应商、市场数据供应商、存储引擎、认证协议或部署 API。若交付确实依赖该选择，先形成决策证据并提交 ADR。
- 每次变更只覆盖当前 Issue；发现后续工作时创建或补充依赖票据，不顺手扩大范围。

## Architecture

- `docs/decisions/0003-select-phase0-technical-and-deployment-baseline.md` 当前仍为 `Proposed`。它提出 Vite + React + TypeScript、薄 Fastify 服务和现有 Nginx + Certbot 入口；经 maintainer review 改为 `Accepted` 后才成为 FNL-001 的绑定基线。ADR 状态表示决策是否成立，不表示下游实现验收已经通过。
- Phase 0 的 `MarketAdapter`、`Analysis` 和 `Presentation` 必须是框架中立的版本化 TypeScript 契约。核心契约不得依赖 React、Fastify、Nginx、Qoder 或供应商类型。
- Fastify 只监听 loopback，Nginx 是 80/443 的唯一公网入口。当前主机已有活动 Nginx/Certbot 和多个 vhost；不得为 FinLens 另起会争用 80/443 的 Caddy，也不得替换现有入口来完成 Phase 0。
- 生产发布使用按 commit SHA 标识的不可变 release 与 `current` 软链接；回滚切回上一已验证 release 并只重启 FinLens 服务，不在生产工作树执行 `git checkout`，也不改动 Nginx/证书状态。

## Commands

- 当前仓库仍是文档阶段，没有 `package.json`，因此没有可运行的项目命令。
- FNL-001 必须在固定 Node 22.x 范围和已提交 npm lockfile 上提供本地开发、静态检查、Vitest、Playwright、生产构建及生产启动脚本；命令真实通过后再把精确命令写入 README 和本节。
- `vite preview` 只能用于本地预览，不得作为生产服务。

## Gotchas & Decisions

- Vite 会把 `VITE_*` 值写入客户端包，任何密钥都不得使用该前缀或进入浏览器构建输入。
- 当前活动入口由宝塔 Nginx 管理；部署时必须用活动 Nginx 二进制校验配置，不能假定 `/usr/sbin/nginx` 与线上实例相同。
- ADR-0003 中的命令、端口、域名和测试均是待实现契约，不是现有通过证据。ADR 接受后由 FNL-001 实现干净构建、正常/失败 fixture、公开 HTTPS、回滚和初始脱敏 Qoder 证据；FNL-005 补齐完整市场适配器状态矩阵，FNL-010 汇总最终证据。

## Product Invariants

- FinLens 只提供可追溯的方向性建议，不提供精确交易指令、代客操作、收益保证或持牌意见声明。
- 建议必须能回到确认输入、带时点证据和明确的分析结论。
- 缺失、过期、冲突、含糊或不支持的数据保持为未知，并触发有限分析、仅观察或分析不可用。
- 用户四项最小约束允许 `unknown/not decided`，不得静默填默认值冒充用户选择。
- 截图或人工输入先产生草稿；只有逐行确认的数据可以进入不可变组合快照。
- 主题只改变表达，不改变计算、证据、覆盖状态、风险判断或方向性建议。
- 访客模拟数据在所有含持仓、金额或建议的界面持续显示 `Simulated` 或等价明确标记。
- Phase 0 访客组合只能从版本化模拟白名单中按可见种子或场景标识确定性选择；禁止不受控随机生成持仓或数值。
- 证据充分性和覆盖状态不代表市场结果概率，不得暴露为 `high confidence` 预测承诺。
- 与当前持仓相关的金融概念翻译是次要价值，不得替代证据、限制、结论或方向性建议。
- 只有证据支持的风险边界突破可以使用更直接紧迫的措辞，仍不得给出精确交易指令。
- 主动查询属于 Post-MVP，不得加入 MVP、首版验收或现有票据完成条件。

## Privacy Boundary

- 公开应用壳、空白体验和明确标注的虚构示例可以公开；用户持仓、约束、问题、截图和个性化分析默认私密。
- 普通入口、NFC、二维码、分享预览和 URL 参数不得包含个人金融数据、凭据或 bearer token。
- 原始截图和完整组合载荷不得进入公共资源、默认日志、分析事件、测试快照或演示 fixture。
- 使用最小化、脱敏的测试数据。不得把真实用户数据提交到仓库。
- 日志、错误报告、截图和录屏在保存或附加到 Issue 前必须检查敏感信息。

## Verification

- 验收以 `docs/specs/mvp.md` 的可观察行为和失败状态为准。
- 核心流程必须覆盖 375px 触控视口，并提供不依赖 hover、动画、NFC、二维码、相机或截图上传的替代路径。
- 对正常路径和降级路径同时验证。测试不得只证明主题卡能渲染。
- 任何物质性叙事结论都应能从证据背面追溯到确认输入、派生结果或带日期证据。
- 测试市场适配器的可用、过期、含糊、不支持、限流和失败状态，禁止用伪造当前值让测试通过。
- 市场适配器验证还必须覆盖逐指标新鲜度策略、来源定位/类别、观察与获取时间、规范化及资产身份依据、修订与冲突 fixture，并确保日志不含凭据。
- 模型仅在实际使用时才成为依赖；模型路径必须验证 schema/version、区分 observed/derived/generated、覆盖超时/畸形输出/有限重试/脱敏/披露，失败时不得显示正常卡片。确定性 Phase 0 不要求调用模型。
- Qoder 是当前比赛构建约束，不得成为隐藏运行时依赖；验证须包含脱离 Qoder 的本地复现和脱敏构建证据。
- 主题叙事中的持仓相关概念解释须有目标新手可理解且不改变理性结论的可观察证据，不强制规定正式用户研究流程。

## Durable Project Knowledge

工作结束后维护持久项目知识：

- 更新根或最近目录的 `AGENTS.md`，记录经源码和测试证实的架构、约定、命令、模块边界及非显然陷阱。
- 保持知识简洁、可复用；不要记录会话过程、临时状态或未经验证的猜测。
- 修正过时条目，不要只追加。文件职责增长时使用子目录 `AGENTS.md` 分层。
- 产品契约写入 `PRODUCT.md` 或 MVP 规格；领域语言写入 `CONTEXT.md`；难以逆转的决策写入 ADR；执行工作写入 Issue。不要混用这些载体。
