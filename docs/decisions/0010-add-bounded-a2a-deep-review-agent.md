# ADR-0010: Add a Bounded A2A Deep-Review Agent

- Status: Accepted
- Date: 2026-07-25
- Ticket: user-directed competition integration

## Context

满懂当前浏览器复盘是应用层拥有的确定性串行流程，模型调用不具备工具反馈循环。新的参评接口需要通过一张 Agent Card 暴露可实测的 A2A Agent，并使用比赛指定的火山方舟 `DeepSeek-Pro` 接入点完成一次性深度任务。直接把无限工具循环塞进现有复盘会破坏 ADR-0004、180 秒截止和可追溯边界。

## Decision

新增独立的服务端 A2A 深度复盘边界：

1. 使用 A2A 1.0 `HTTP+JSON`，在 `/.well-known/agent-card.json` 发布单张 Agent Card，在 `/a2a/message:send` 接受普通调用；首版不声明 streaming、push notification、任务历史或扩展 Card。
2. A2A 调用使用独立 Bearer 凭据。模型通过火山方舟 OpenAI-compatible API `https://ark.cn-beijing.volces.com/api/v3` 调用，`model` 固定为比赛 DeepSeek-Pro Endpoint ID `ep-20260708162855-pcf9x`，API Token 只从服务端 `ARK_API_KEY` 读取；密钥不复用为调用凭据，不进入 Card、响应、日志或测试。`ARK_BASE_URL` 只允许作为受控网关或本机测试覆盖，不能改变固定 Endpoint ID。
3. 输入为自然语言任务和可选的版本化 `PortfolioSnapshot`。接口不读取浏览器工作区、Cookie 或历史，不保留跨请求模型记忆。
4. AI SDK Core 的 `tools`、`stopWhen` 和 `abortSignal` 驱动受控循环。最多 8 个模型步骤；工具只能检查请求上下文、通过明确授权的数据源查询快照内资产的行情、运行确定性派生和提交最终摘要。授权源未配置时记录类型化失败，不回退未授权第三方。
5. 总截止为 900 秒。循环阶段最多 810 秒，之后用剩余预算总结已取得上下文；任何阶段都受同一个绝对截止约束。正常完成、`finalize`、步数上限、取消、失败或截止都进入明确终态。
6. 最终 A2A envelope 和 `mandong.a2a.deep-review.v1` 数据结构由服务端装配。模型不能生成或覆盖协议状态、模型展示名、提供商、Endpoint ID、时间、步骤、工具轨迹、Skills、数据来源、证据、派生结果或固定风险提示；候选总结越过隐私、收益保证或精确交易指令边界时回退到确定性汇总。
7. 现有浏览器每日复盘、180 秒硬截止和单 Agent 串行默认路径保持不变。

## Consequences

- 参评方可以用一张 Card 完成真实 A2A 普通调用，并获得版本化的最终上下文摘要。
- 深度模式有更长延迟和模型成本，只能显式调用，不能成为浏览器主路径的隐式依赖。
- 公开部署需要为 `/a2a/` 单独设置不短于 900 秒的代理读取/发送 timeout，同时保留其它路径的 210 秒边界。
- 若未来开放流式 A2A、任务恢复、更多数据源或浏览器入口，必须分别补充契约与验收。

## References

- `PRODUCT.md`
- `docs/specs/analysis-contract.md`
- ADR-0004、ADR-0006、ADR-0007
- A2A Agent Card 自测台（赛事提供，2026-07-25）
- AI SDK Core tools and multi-step calls: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- 火山方舟官方 Node SDK `@volcengine/ark-runtime@1.0.10`：默认 `ARK_API_KEY`、Bearer 鉴权与 `https://ark.cn-beijing.volces.com/api/v3`
