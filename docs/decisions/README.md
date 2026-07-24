# 架构决策记录

当前没有状态为 `Accepted` 的有效 ADR。旧 `0001` 至 `0003` 已从当前文档集删除：产品与隐私规则已进入 [`../../PRODUCT.md`](../../PRODUCT.md)、[`../specs/demo-v1.md`](../specs/demo-v1.md) 和 [`../specs/analysis-contract.md`](../specs/analysis-contract.md)；其中提出的 Vite/Fastify 技术基线从未被接受，不能约束后续实现。

旧文件仍可从 Git 历史查看。分支 `archive/qoder-interrupted-20260724` 及 commit `8c57fad` 保留中断 Qoder 产物及重建前上下文，只用于审计，不代表这些决策或实现有效。

只有难以逆转、反直觉或会约束多个后续切片的技术权衡才需要新增 ADR。ADR 应说明状态、上下文、候选方案、决定、后果、替换边界和验收证据；`Proposed` 不得被实现当作已授权基线。
