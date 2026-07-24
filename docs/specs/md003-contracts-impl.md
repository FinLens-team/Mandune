# MD-003 实现规格（#25）

## Goal
建立唯一公共 contracts 与版本化 fixture，覆盖 `supported` / `limited` / `observation_only` / `unavailable`，供 #26–#32 等下游消费。

## In scope
- `src/contracts/**`：框架中立 TypeScript 类型 + 运行时校验 + 建议/隐私边界
- `src/fixtures/**`：确定性场景、索引、稳定 hash/replay
- `tests/contracts/**`：schema、状态矩阵、隐私、建议策略、重放

## Non-goals
- DB/UI/供应商/模型实现
- 真实私人持仓
- 把 fixture 称为 PandaAI 缓存

## Acceptance
1. 同一 fixture version+scenario 重放得到相同输入、派生、证据与状态
2. 物质性结论均有确认输入 / derived / evidence 引用
3. observation/fetch/cutoff 时点可区分
4. 未知版本、缺证、摘要冒充事实、越界建议被拒绝
5. 缺失/过期/冲突/不支持/限流/失败不产生伪当前值
6. 隐私扫描：无原图、身份、账户、密钥字段

## Design notes
- 契约版本：`CONTRACTS_VERSION = "1.0.0"`
- 无新运行时依赖；纯 TypeScript 校验
- 保留现有 `HealthResponse` / `SERVICE_NAME`
- fixture 使用虚构最小数据并标注 example
