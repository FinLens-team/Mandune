# 满懂

满懂是面向年轻轻投资者的每日持仓复盘产品。它把用户确认的基金、ETF 和少量 A 股持仓、四项个人约束，以及截至最新完整交易日的带时点证据，整理成一张可阅读、可翻面核对的“观象长笺”。产品只提供证据支持的方向性建议，不预测涨跌，不给出精确交易指令，也不替用户操作。

仓库名继续使用 `finlens`；用户界面、演示和对外材料统一使用“满懂”。

## 当前状态

本仓库目前仅包含产品、设计、分析、集成、比赛和交付文档。主分支没有 `package.json`、可运行应用或已经验证的安装、开发、测试、构建、启动和部署命令，也尚未选定实现框架、存储引擎、认证协议或部署方案。

PandaAI 和 Bocha 的资料边界已经整理，但项目凭据下的接口权限、响应语义、覆盖范围、限流和稳定性尚未完成运行验收。因此当前不能声称供应商已经接通。

分支 `archive/qoder-interrupted-20260724` 的 commit `8c57fad` 保存了一次中断的 Qoder 产物。它只用于审计失败与恢复过程，不代表已接受实现、可运行产品或通过验收的比赛证据。

## 阅读顺序

1. [`PRODUCT.md`](PRODUCT.md)：稳定产品目的、范围、不变量和非目标。
2. [`CONTEXT.md`](CONTEXT.md)：满懂统一使用的领域术语。
3. [`DESIGN.md`](DESIGN.md)：东方观象、兜兜、观测台和观象长笺的设计边界。
4. [`docs/specs/demo-v1.md`](docs/specs/demo-v1.md)：Demo V1 的完整可观察流程和验收条件。
5. [`docs/specs/analysis-contract.md`](docs/specs/analysis-contract.md)：分析输入、证据、结果、降级和模型边界。
6. [`docs/integrations/pandaai-bocha.md`](docs/integrations/pandaai-bocha.md)：PandaAI 与 Bocha 的已知事实、未知项和运行验收门槛。
7. [`docs/decisions/README.md`](docs/decisions/README.md)：当前 ADR 状态。

完整文档地图见 [`docs/README.md`](docs/README.md)。

## 实现边界

- 原始截图只用于产生待复核草稿，并在成功、失败或中止后删除。只有用户确认的结构化行可以进入组合快照。
- 提取模型只在用户知情后临时接收原始截图；分析模型只接收用户确认的完整结构化持仓、约束和证据。原图、身份与账户信息、工作区访问凭据和供应商密钥不得进入分析模型；完整私人持仓不得进入公开页面、URL、默认日志、分析事件或演示 fixture。
- 每项物质性结论必须能追溯到确认输入、可复算派生结果或已核验的带日期证据。缺失、过期、含糊、冲突、不支持或无法核验的数据保持未知，并缩小或停止分析。
- 建议只表达定性方向，不包含精确金额、份额、比例、价格、买卖时点、收益保证或代客操作。
- 主题和兜兜只改变表达，不能改变证据、计算、覆盖、风险判断或方向性建议。
- 主动查询、自由追问和聊天式投资问答不属于 Demo V1。

## 参与开发

执行工作使用带依赖和可观察验收条件的 GitHub Issues。建议的纵向切片见 [`docs/tickets/README.md`](docs/tickets/README.md)，贡献流程见 [`CONTRIBUTING.md`](CONTRIBUTING.md)，Agent 规则见 [`AGENTS.md`](AGENTS.md)。

AdventureX 事实、提交草稿、演示脚本和 Qoder 协作证据是待最终产品与实时 Portal 复核的工作材料，入口见 [`docs/competition/`](docs/competition/)。
