# 满懂 Demo V1 交付图

实际开发任务位于 GitHub milestone [`Demo V1`](https://github.com/FinLens-team/finlens/milestone/1)。产品边界来自 [`../../PRODUCT.md`](../../PRODUCT.md)，体验、分析和供应商约束分别来自 [`../specs/demo-v1.md`](../specs/demo-v1.md)、[`../specs/analysis-contract.md`](../specs/analysis-contract.md) 和 [`../integrations/pandaai-bocha.md`](../integrations/pandaai-bocha.md)。

## 自助认领

可认领池：[`status:ready + no:assignee`](https://github.com/FinLens-team/finlens/issues?q=is%3Aissue+is%3Aopen+label%3Astatus%3Aready+no%3Aassignee)。

1. 只认领带 `status:ready` 且没有 assignee 的 Issue。`status:blocked` 表示依赖或外部条件尚未解除。
2. 先评论：`CLAIM @账号 | branch issue/<编号>-<slug> | owned paths <路径> | next update <时间+时区>`。
3. 自分配为唯一 assignee，并移除 `status:ready`。一个 Issue 只允许一个 owner；reviewer 不加入 assignee。
4. 从最新 `main` 创建 `issue/<编号>-<slug>`，尽早提交 Draft PR；PR 正文使用 `Closes #<编号>`。
5. 当前私有仓库套餐不能强制保护 `main`。严禁直推 `main`；所有文件必须通过任务分支和 PR 审查合入。
6. 认领者最迟每 24 小时在 Issue 或 PR 留下可验证更新。维护者提醒后再过 24 小时无回应，可以释放认领。
7. 释放时评论 `HANDOFF`，列出 branch/commit/PR、已完成、未完成、验证结果、已触碰文件和阻塞，然后取消分配。不要删除已有分支或证据。

同时认领时，以最早满足格式且文件边界无冲突的 `CLAIM` 评论为准。不要用“谁先 push”裁决。

## 状态模型

| 状态 | GitHub 表示 | 含义 |
|---|---|---|
| Ready | `status:ready`，无 assignee | 依赖已完成，可以自助认领 |
| Blocked | `status:blocked`，无 assignee | 等待依赖、证据或决定 |
| Claimed | 唯一 assignee，无 ready/blocked | owner 正在交付 |
| Closed | PR 合并且验收证据齐全 | 可以解锁直接下游 |

只有最终 PR 合并并关闭前置 Issue 才算依赖完成。Draft PR、部分 commit、计划文档或归档 Qoder 产物都不解锁下游。

## 依赖图

| Issue | 交付物 | 依赖 | 初始状态 | 独占责任边界 |
|---|---|---|---|---|
| [#23](https://github.com/FinLens-team/finlens/issues/23) | MD-001 技术基线与可运行脚手架 | 无 | Ready | 根工具链、bootstrap、smoke、ADR |
| [#24](https://github.com/FinLens-team/finlens/issues/24) | MD-002 PandaAI/Bocha 权限探测 | 无 | Ready | `tools/provider-probe`、运行验收文档 |
| [#25](https://github.com/FinLens-team/finlens/issues/25) | MD-003 版本化契约与确定性 fixture | #23 | Blocked | `src/contracts`、`src/fixtures`、契约测试 |
| [#26](https://github.com/FinLens-team/finlens/issues/26) | MD-004 匿名私密工作区 | #25 | Blocked | `src/workspace`、工作区迁移与测试 |
| [#27](https://github.com/FinLens-team/finlens/issues/27) | MD-005 持仓复核与四项约束 | #25 | Blocked | `src/portfolio`、review、constraints |
| [#28](https://github.com/FinLens-team/finlens/issues/28) | MD-006 多模态截图草稿与删除 | #27 | Blocked | screenshot-import、extraction |
| [#29](https://github.com/FinLens-team/finlens/issues/29) | MD-007 中立市场与事件证据 | #24、#25 | Blocked | providers、evidence |
| [#30](https://github.com/FinLens-team/finlens/issues/30) | MD-008 证据边界内 Agent Team | #29、#25 | Blocked | analysis |
| [#31](https://github.com/FinLens-team/finlens/issues/31) | MD-009 真实 Agent 观测台 | #30 | Blocked | observatory |
| [#32](https://github.com/FinLens-team/finlens/issues/32) | MD-010 东方观象长笺、兜兜与主题 | #25 | Blocked | long-card、theme、`assets/doudou` |
| [#33](https://github.com/FinLens-team/finlens/issues/33) | MD-011 不可变分析历史 | #26、#30 | Blocked | history、历史迁移与测试 |
| [#34](https://github.com/FinLens-team/finlens/issues/34) | MD-012 完整 Demo V1 用户旅程 | #26、#27、#28、#31、#32、#33 | Blocked | app 路由、journey tests |
| [#35](https://github.com/FinLens-team/finlens/issues/35) | MD-013 公网部署与验收 | #34 | Blocked | deploy、E2E、acceptance |
| [#36](https://github.com/FinLens-team/finlens/issues/36) | MD-014 AdventureX/Qoder 证据包 | #35 | Blocked | competition、比赛素材 |

关键路径：`#23 → #25 → #27 → #28 → #34 → #35 → #36`，以及 `#24 + #25 → #29 → #30 → #31 → #34`。

## 已接受 ADR 与票据映射

| ADR | 决策 | 对应实际 Issue |
|---|---|---|
| ADR-0004 | 确定性证据 + 串行模型分析与主题叙事 | [#30](https://github.com/FinLens-team/finlens/issues/30) MD-008 |
| ADR-0005 | PandaAI 初始结构化数据上游 | 探测 [#24](https://github.com/FinLens-team/finlens/issues/24) MD-002；接入 [#29](https://github.com/FinLens-team/finlens/issues/29) MD-007 |
| ADR-0006 | OpenAI-compatible `ModelGateway` | [#30](https://github.com/FinLens-team/finlens/issues/30) MD-008 |
| ADR-0007 | Vercel AI SDK Core 初始模型运行时 | [#30](https://github.com/FinLens-team/finlens/issues/30) MD-008 |

ADR 中旧 8 票语义下的 `MD-002/MD-005/MD-006` 不得按编号直接对应上表 MD-00x；以本表与 GitHub Issue 编号为准。

## 依赖解锁

前置 PR 合并并关闭后，维护者逐一检查直接下游：

1. 正文列出的所有依赖是否均已关闭且有验收证据；
2. 是否已冻结公共 schema、接口和文件责任边界；
3. 是否与其他已认领 Issue 存在独占或共享路径冲突；
4. 满足后评论 `UNBLOCKED by #<issue>/#<pr>`，移除 `status:blocked` 并添加 `status:ready`。

依赖被重开或证据撤回时，未认领下游退回 `status:blocked`。已认领任务只暂停受影响边界，由维护者明确合并、拆票或交接方案。

## 文件冲突规则

- `package.json`、lockfile、构建/部署配置、公共 schema、全局 tokens、fixture 索引和根指导文档只能由正文指定 owner 修改。
- 集成票 `#34` 只能调用下游公开接口；发现缺口时回原 Issue 补票，不能顺手修改模块内部。
- 供应商探测 `#24` 不触碰产品 adapters、公共 schema 或私人数据。
- 每个 PR 必须列出实际修改文件；出现正文未声明的共享路径时，先在两个 Issue 评论并由维护者确定顺序。

## 旧 Issue 审计

旧 `#12–#22` 基于已退出的 FNL Phase 0/MVP/NFC 路线。审计确认这些 Issue 创建后没有评论、关联 PR 或 commit 证据；原正文已保留并追加新票映射，随后以 `superseded / not planned` 关闭。旧 assignee 和完成状态没有迁入新交付图。
