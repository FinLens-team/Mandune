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

- 仓库当前处于文档阶段，没有 `package.json`、应用源码或可运行的安装、开发、检查、测试、构建、启动和部署命令。
- 当前接受的 ADR 为 0004-0007：确定性串行分析管线、PandaAI 初始结构化数据上游、OpenAI-compatible `ModelGateway`、以及 Vercel AI SDK Core 初始模型运行时。仍没有已接受的前端、存储、认证或部署基线；旧 0001-0003 已退出当前契约。
- PandaAI 已通过脱敏 credentialed spike 验证代表性 A 股和 ETF 历史路径；Bocha 与 PandaAI 的完整方法、资产矩阵、限流、修订和生产运行验收仍需按集成文档完成。方法名、文档示例或申请状态不能替代真实权限与响应证据。
- 分支 `archive/qoder-interrupted-20260724` 的 commit `8c57fad` 是未验证的中断 Qoder 产物，不得当作已接受实现或完成证据。

## 已接受的技术决策

- ADR-0004 规定确定性证据、派生和串行模型分析先后顺序；主题只消费同一份已校验的理性分析，不能改变证据、结论或建议。
- ADR-0005 选择 PandaAI 作为初始真实结构化数据上游；A 股和 ETF 代表性路径已验证，场外基金和完整生产矩阵仍保持明确的未知/待验收状态。
- ADR-0006 规定框架中立的 OpenAI-compatible `ModelGateway`；structured output、streaming、multimodal 和 tools 必须逐项 capability-test。
- ADR-0007 选择服务端 Vercel AI SDK Core 与 `@ai-sdk/openai-compatible`；每日复盘仍由应用层编排，不引入自主 Agent loop。

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
- 截图和手工输入先形成草稿；只有用户确认的行进入不可变组合快照。
- 东方观象正面与理性证据背面使用同一版本的快照、证据、结论和建议。
- 主题和兜兜只改变表达、服饰与环境，不改变数据、证据选择、计算、覆盖、风险判断或方向性建议。
- 证据充分性、Agent 数量或运行阶段不表示未来市场结果概率，也不能显示为预测置信度。
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
- 主题对照必须证明证据、派生结果、覆盖、风险和建议一致。Agent 观测台状态必须来自真实任务，不按计时器伪造。
- 比赛完成声明只使用最终分支、浏览器验收和脱敏协作证据。Qoder 记录不能替代产品验证。

## 命令

当前没有项目命令。引入命令的 Issue 必须提交锁定依赖和可复现脚本，在干净环境中实际通过后同步更新本节与 [`README.md`](README.md)。不要把规划中的命令写成现状。

仓库提交信息由 `.githooks/commit-msg` 校验；首次克隆后执行 `git config core.hooksPath .githooks` 启用。主题和正文必须包含中文但允许混用英文术语，正文格式和长度不作限制；主题后使用真实空行，不得使用字面量 `\\n`。PowerShell 执行 `powershell -ExecutionPolicy Bypass -File .githooks/test-commit-msg.ps1`，POSIX shell 执行 `sh .githooks/test-commit-msg.sh`，可离线验证 Hook。

本项目同步上游时以 `origin/main` 为基线：先执行 `git fetch origin`，再使用 `git rebase origin/main` 将本地提交放到最新上游之后；冲突按当前产品契约逐文件解决并完成验证，不使用 merge commit 作为日常同步方式。

## 持久知识

工作结束后，把源码和测试证实的架构、约定、命令、模块职责和非显然限制写入根或最近目录的 `AGENTS.md`。产品规则写入 `PRODUCT.md` 或规格，领域术语写入 `CONTEXT.md`，设计规则写入 `DESIGN.md`，难以逆转的技术决策写入 ADR，执行工作写入 Issue。不要记录会话过程、临时状态、凭据或未经验证的猜测。
