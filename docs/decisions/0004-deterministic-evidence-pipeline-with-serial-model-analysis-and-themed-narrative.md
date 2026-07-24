# ADR-0004: Deterministic Evidence Pipeline with Serial Model Analysis and Themed Narrative

- Status: Accepted
- Date: 2026-07-24
- Ticket: MD-006

## Context

满懂需要把用户确认的组合快照和带时点证据转换为可追溯、可降级的观象长笺。模型可以帮助整理和表达，但不能成为取数路径、补写未知项或改变主题结论的隐式事实来源。

## Decision

采用“确定性证据管线 + 串行模型分析与主题叙事”的架构：

1. 校验并冻结快照，解析资产身份和覆盖范围；
2. 通过供应商中立的结构化数据和事件适配器获取证据；
3. 用确定性规则计算暴露、约束冲突、覆盖和分析状态；
4. 生成不含主题指令的、主题无关的理性分析，并绑定 `rational_analysis_id/version`；
5. 通过命名 schema/version 和内容边界校验理性分析；
6. 主题叙事只消费同一份已校验理性分析，不能重跑取数、派生或改变结论；
7. 用同一分析版本装配东方观象正面和理性证据背面。

`observed`、`derived` 和 `generated` 必须保持可区分。模型失败、超时、畸形、缺证或越界时不得展示部分生成文本，按分析契约进入 `limited`、`observation_only` 或 `unavailable`。Phase 0 使用确定性 fixture，不要求模型调用；主动查询和工具循环仍不属于 Demo V1。

## Consequences

- 理性分析先于主题表现生成，主题切换不会改变证据、计算、覆盖、风险或建议。
- 取数和派生可复现，模型供应商和运行时可替换；模型不进入证据发现路径。
- 分析实现需要保存版本化证据、派生结果、模型输出状态和降级原因。

## References

- `docs/specs/demo-v1.md`
- `docs/specs/analysis-contract.md`
- `docs/integrations/pandaai-bocha.md`
- ADR-0005、ADR-0006、ADR-0007
