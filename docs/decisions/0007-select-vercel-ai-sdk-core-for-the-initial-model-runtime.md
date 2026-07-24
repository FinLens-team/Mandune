# ADR-0007: Select Vercel AI SDK Core for the Initial Model Runtime

- Status: Accepted
- Date: 2026-07-24
- Ticket: #30 / MD-008；未来主动查询票据

## Context

ADR-0006 已确定 OpenAI-compatible `ModelGateway` 边界，但仍需要一个可在 Node 服务中使用的 TypeScript 运行时。当前每日复盘是应用层拥有的串行、可审计管线，不应提前变成自主 Agent loop。

## Decision

使用 Vercel AI SDK Core 与 `@ai-sdk/openai-compatible` 作为 `ModelGateway` 的初始服务端实现。

- SDK 只存在于服务端模型适配器，核心分析契约保持框架中立；不要求 Next.js 或 Vercel Hosting。
- 每日复盘继续由应用层按 ADR-0004 编排，不能用自主 Agent 或 `ToolLoopAgent` 编排取数、派生、理性分析或主题装配。
- 显式配置 timeout、abort、重试上限、schema/version 校验和最大模型/工具步数；provider 声称的 strict capability 必须由集成测试证明。
- 不因为 SDK 支持就引入 AI Gateway、AI SDK UI、MCP、memory、tool approval 或 LangGraph；这些能力必须由后续票据和可观察需求单独决定。

## Consequences

- 初始模型运行时保持小型、TypeScript 原生且可替换。
- 未来对话和工具调用有迁移路径，但不会成为 Demo V1 的隐式依赖。
- 运行时 spike 仍需证明 structured result、畸形输出、超时取消、provider 替换和合成工具调用边界。

## References

- `docs/specs/analysis-contract.md`
- ADR-0004、ADR-0006
- AI SDK OpenAI-compatible providers：https://ai-sdk.dev/providers/openai-compatible-providers
- AI SDK tools：https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
