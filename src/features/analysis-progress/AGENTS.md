# Analysis Progress

## Architecture

- `projection.ts` 是 S8 的纯投影边界：只接受指定 `analysisId` 的 `TaskEvent`、显式连接状态和显式终态结果。
- `AnalysisProgress.tsx` 同时渲染主题向导、事件驱动气泡与滚动任务记录；模型连接、首包、思考和流式 Markdown 标题都进入“生成并校验”历史，并可从已持久化任务事件恢复。
- 分析页的退出与跨页导航统一由 `WorkspaceNav` 抽屉承担；运行态不提供“暂时离开”，终态页内只保留查看结果或重试这类任务动作。

## Conventions

- 阶段顺序来自 `TASK_EVENT_STAGES`，阶段状态只来自对应真实事件；未收到事件时使用 `not_reported`，不得推断 `pending`、完成度或结果状态。
- 重连时按 `event_id` 去重并保留输入流顺序。跨 `analysisId` 的事件和终态不能进入当前任务投影。
- 进入 S9 需要 controller 显式提供 `terminal.displayable=true`，表示同一任务已有已校验结果和匹配叙事；status 本身不构成展示证据。

## Gotchas & Decisions

- `persist_or_return:succeeded` 不等于结果已到达。只有同一 `analysisId` 的显式 `terminal` 输入才能结束 S8。
- `failed`、`cancelled`、`timed_out` 事件会立即停止事件动效，但不会自行生成终态或重试入口。
- S8 不使用持续忙碌动画；只有真实新事件到达时淡变气泡。页面隐藏、组件离屏、连接中断、结果到达或系统减少动态偏好开启时不播放该动效。
- 等待页首次吉祥物动作会请求播放一次共享音乐；主页入口的用户手势提前解锁 Web Audio。等待页每次点击吉祥物都创建独立声源以允许重叠，音频失败不得影响分析状态。

## Commands

```sh
pnpm vitest run tests/analysis-progress
pnpm check
pnpm build
```
