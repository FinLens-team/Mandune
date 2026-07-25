# Demo V1 前端流程补充规格

本文件把「首次引导 → 主界面 → 分析 → 结果」的可观察屏幕、Demo 占位策略与已拍板决策固定下来。产品红线以 [`../../PRODUCT.md`](../../PRODUCT.md) 为准；分析边界以 [`analysis-contract.md`](./analysis-contract.md) 为准；完整验收以 [`demo-v1.md`](./demo-v1.md) 为准。

## 已拍板决策

1. **引导流**：S0 已移除；首次访问从 S1 主题 → S2 来源 → S3 随机身份 → S4 主界面 → S7 确认 → S8 分析 → S9 复盘报告；侧边栏承载仓位/历史/关于。
2. **Demo 主路径**：随机体验持仓；手工与截图为「暂未开放」占位。
3. **吉祥物**：每主题可不同形象；我是龙 = 奶龙；其余主题占位。
4. **分析编排**：单 agent 串行阶段，不是多 agent 编排团队。
5. **分析表达**：聊天气泡短句 + 真实任务阶段；90s/180s。
6. **数据**：真实优先 + 同资产缓存/fixture 诚实兜底。
7. **侧边栏**：类 FlyBuild 抽屉导航，无账号体系。
8. **视觉基线**：两份 Gemini 提案不原样采用；以第一版克制骨架为基础，吸收第二版响应式细节，最终以 [`../design/demo-v1-visual-system.md`](../design/demo-v1-visual-system.md) 为唯一实现规格。

## 屏幕索引

| ID | 名称 | 关键出口 |
|---|---|---|
| S0 | 已移除 | 不渲染；首次→S1，回访→S4 |
| S1 | 主题选择 | 选中东方观象→S2 |
| S2 | 来源选择 | 随机体验→S3 |
| S3 | 随机身份只读 | 确认→S4 |
| S4 | 主界面 | 吉祥物→S7；侧边栏→S5 |
| S5 | 侧边栏 | 仓位/历史/关于 |
| S6 | 仓位身份可编辑 | 保存为后续快照输入 |
| S7 | 二级确认 | 开始→S8 |
| S8 | 分析中 | 完成→S9 或降级态 |
| S9 | 每日复盘报告 | 翻面；可回历史 |
| S10 | 历史 / 关于 | 静态或绑定历史卡 |

## 与实现仓库的映射（当前）

| 能力 | 现状 | Demo 流要求 |
|---|---|---|
| 工作区 | `src/workspace` 已有 | S5 底部展示 last_active / expires |
| 契约/fixture | `src/contracts` `src/fixtures` | 随机池与缓存兜底 |
| 持仓复核 | `src/portfolio` `features/review` | 收敛为 S3/S6；Demo 隐藏完整手工/截图成功路径或改为占位 |
| 截图提取 | `src/extraction` 已有 | Demo UI 占位「暂未开放」，不走真实上传 |
| 证据适配 | `src/providers` `src/evidence` | S8 真实优先 |
| 复盘报告 | `features/long-card` | S9 |
| 单 agent 编排 | 未完成（原 #30） | S8 核心缺口 |
| 引导/侧边栏/主界面 | 已实现 | S1–S5、S7；S0 已移除 |

## 文档同步清单

- [x] PRODUCT / DESIGN / CONTEXT 吉祥物与主题
- [x] demo-v1 屏幕流与 Demo 占位
- [x] analysis-contract 单 agent Demo 编排说明
- [x] 前端视觉与动效：[`../design/demo-v1-visual-system.md`](../design/demo-v1-visual-system.md)
