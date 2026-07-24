# ADR-0006: Adopt an OpenAI-Compatible Model Gateway

- Status: Accepted
- Date: 2026-07-24
- Ticket: #30 / MD-008（证据边界内单 agent 分析管线）

## Context

满懂需要在证据管线之后调用模型，并为未来对话或工具调用保留替换空间。直接把分析契约绑定到某个供应商 SDK，会把 provider wire type、错误形状和能力假设扩散到产品边界。

## Decision

建立版本化、框架中立的 `ModelGateway`，以 OpenAI-compatible transport profile 作为初始外部模型边界。网关统一管理服务端 provider、base URL、model ID、超时、重试、结构化 schema、可选工具、流式策略、规范化输出、usage 和类型化失败。

- 非流式文本生成是首个模型路径的最低能力；structured output、streaming、multimodal 和 tools 必须逐项 capability-test。
- provider wire type 不进入 `Analysis`、`Presentation`、组合或证据契约；模型输出始终标为 `generated`。
- base URL、model ID 和凭据由服务端配置，不接受用户输入，不进入 `VITE_*`、浏览器包、日志、fixture 或用户证据。
- 确定性 fixture 路径可以完全不调用模型；主动查询仍不属于 Demo V1。

## Consequences

- 可以替换 OpenAI 或其他兼容供应商，而不修改领域契约。
- 结构化输出、流式和工具能力不能仅凭 URL 或 SDK 名称宣称支持，必须有对应测试。

## References

- `docs/specs/analysis-contract.md`
- `docs/tickets/README.md`
- OpenAI function calling guide：https://developers.openai.com/api/docs/guides/function-calling
