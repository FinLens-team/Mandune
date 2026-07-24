# ADR-0005: Use PandaAI as the Initial Market-Data Source

- Status: Accepted
- Date: 2026-07-24
- Ticket: MD-005

## Context

满懂需要基金、ETF 和少量 A 股的带时点结构化证据。2026-07-24 的脱敏 credentialed spike 使用 `panda_data` 0.0.12，在隔离 Python 3.12 环境中验证了代表性路径：`000001.SZ` A 股查询成功，`510300.SH` ETF 查询返回两条日线记录；同次 `000001.OF` 场外基金查询无记录，因此不能宣称场外基金覆盖。Python 3.13 的 `numpy<2` 依赖安装失败，Python 3.12 成功；SDK 默认写入加密 `user.json`，生产集成必须处理这一持久化边界。

这证明了代表性 A 股和 ETF 路径可用，不等于五个 SDK 方法、全资产矩阵、生产 entitlement、新鲜度、限流、修订和冲突处理已经完成验收。

## Decision

选择 PandaAI 作为 MD-005 的初始真实结构化数据上游，所有请求和响应必须隐藏在版本化、供应商中立的证据适配器后。Phase 0 和示例默认继续使用确定性或透明缓存 fixture，不把 PandaAI 可用性作为公开演示前提。

- PandaAI SDK 类型、认证对象、异常和字段不得进入分析契约；适配器统一输出资产身份、指标、值、单位、观察时间、获取时间、来源和类型化状态。
- 空结果不得当作当前值、零值或可用；场外基金保持 `unsupported`、`ambiguous` 或 `unverified`，并触发有限分析。
- 凭据只存在受保护的服务边界，不进入浏览器、日志、fixture、Issue、证据或仓库；生产必须禁用 SDK 残留 `user.json`。
- A 股、ETF、场外基金、鉴权、限流、超时、畸形响应、修订和冲突仍须分别完成 MD-002/MD-005 运行验收。

## Consequences

- 项目可以基于已验证的 A 股和 ETF 代表性路径开始适配器实现，同时清楚暴露未覆盖边界。
- 替换供应商只影响适配器；生产上线仍需要完整运行矩阵和凭据处理证据。

## References

- `docs/integrations/pandaai-bocha.md`
- `docs/specs/analysis-contract.md`
- PandaAI API 文档：https://www.pandaaiquant.com/data-service/api-docs?api=data_fetch_doc
