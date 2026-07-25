# PandaAI 赛道 Agent 开源参考

- 核验日期：2026-07-25（UTC+8）
- 用途：为满懂 A2A 深度复盘接口选择可验证的 Agent、金融研究与数据抽象实践
- 边界：以下项目只作为架构与验收参考；未引入其代码或运行依赖，后续复用前仍须逐项核对许可证与供应商授权

## 直接相关资料

| 项目 | 可借鉴能力 | 对满懂的取舍 |
|---|---|---|
| [A2A Protocol](https://github.com/a2aproject/A2A) | Agent Card 发现、标准消息、同步/流式/异步长任务、认证与不暴露内部状态 | 继续以公开 Card、独立 Bearer、终态 Message 和服务端工具轨迹作为比赛接口；不展示思维链或内部记忆 |
| [A2A JavaScript SDK](https://github.com/a2aproject/a2a-js) | A2A v1.0 的 JSON-RPC、HTTP+JSON/REST、gRPC、取消、签名 Card 与 Bearer/JWT 示例 | 当前手写 HTTP+JSON 面已经通过赛事检查器，不在赛前扩大迁移风险；公开部署后可单独评估用官方 SDK 替换协议胶水 |
| [Vercel AI SDK](https://github.com/vercel/ai) | `generateText` 多步工具调用、`stopWhen`、`hasToolCall`、`isStepCount`、`abortSignal`、总超时与有限重试 | 现有 8 步上限、`finalize` 停止条件、810 秒循环预算和 900 秒绝对截止符合当前 API；继续由应用层拥有边界 |
| [Microsoft Qlib](https://github.com/microsoft/qlib) / [RD-Agent](https://github.com/microsoft/RD-Agent) | 从研究假设到因子/模型实验的可复现工作流，以及自动化研发中的评估闭环 | 借鉴“假设—数据—评估—报告”的证据链；Demo 不扩成因子挖掘、训练或自主优化系统 |
| [FinRL](https://github.com/AI4Finance-Foundation/FinRL) | train-test-trade 分层、基准评估、风险与回测隔离 | 借鉴独立评估和降级测试；当前产品不做 RL、自动交易或把回测表现当未来收益承诺 |
| [FinGPT](https://github.com/AI4Finance-Foundation/FinGPT) | 金融语料、情绪分析、检索增强和轻量适配研究 | 借鉴“领域模型输出仍需证据约束”；不把模型知识直接升级为当前市场事实 |
| [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) | 数据、建模、综合、报告和辩论角色的可审计金融研究流水线 | 仅借鉴角色职责与产物可追踪；当前 A2A Agent 保持单个受控工具循环，避免为展示而拆成多个 Agent |
| [OpenBB](https://github.com/OpenBB-finance/OpenBB) | “一次连接、多处消费”的数据提供方抽象，以及面向 Agent 的 REST/MCP 数据面 | 强化供应商中立的 `EvidenceRecord` 与 `data_sources` 输出；不在赛前引入新的 Python 数据平台或未授权数据源 |
| [QuantSkills / skill-pandadata-api](https://github.com/quantskills/skill-pandadata-api) | `panda_data==0.0.12`、Python 3.10+、218 个方法的本地参考/调用脚本、凭据感知初始化和方法兼容索引 | 可作为 PandaAI 方法选择与验收参考；它是 GPL-3.0 Python Skill/CLI，不是 Node SDK 或托管 HTTP API，当前单包 Node 生产基线不直接嵌入 |

## 已吸收的高信号实践

1. 终态结构显式列出 `skills_used`、`data_sources`、工具状态和证据 ID，评审无需从自然语言猜测 Agent 做过什么。
2. 风险提示由服务端固定装配到文本 Part 和 JSON Data Part，模型不能删除或改写。
3. 候选总结经过隐私、收益保证和精确交易指令边界检查；越界文本不展示，回退到确定性汇总。
4. Agent Card 提供三个代表性示例任务，自动测试逐项验证可被 A2A 普通调用接受。
5. 保留单 Agent、有限步骤、绝对截止和明确降级，避免把 Agent 数量或循环长度包装成结果可靠度。

## 暂不引入

- 多 Agent 编排框架：当前赛道允许单 Agent，产品契约也要求浏览器主路径保持单 Agent；新增框架不会自动增加任务完成质量。
- 因子挖掘、RL、自动回测与交易执行：不属于满懂的一次性组合复盘边界，并会扩大合规与验收范围。
- 新数据聚合平台：赛事要求不得使用未授权数据或第三方服务，任何新来源必须先完成权限、字段、时点、限流与错误验收。
- QuantSkills Python sidecar：需要新增 Python 3.10+ 生产运行时、进程生命周期、凭据文件与 GPL 合规边界；在相关技术决策和真实 PandaAI 凭据/方法验收完成前保持 fail closed。
- A2A streaming、push notification 和任务恢复：当前 Card 明确不声明，普通调用已经满足基础门槛；需要时另开契约和验收。

## 后续优先级

1. 把当前 fail-closed 的 A2A 结构化行情边界接到赛事明确授权的 PandaAI Data Skills，并完成运行矩阵。
2. 在公开 HTTPS 环境验证 Card、Bearer、取消、900 秒截止、服务重启和 Nginx 930 秒路径。
3. 若平台需要任务生命周期、流式或签名 Card，再基于官方 `@a2a-js/sdk` 单独做兼容性迁移。
