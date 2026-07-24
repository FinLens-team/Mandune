# Analysis Progress

## Architecture

- `projection.ts` 是 S8 的纯投影边界：只接受指定 `analysisId` 的 `TaskEvent`、显式连接状态和显式终态结果。
- `AnalysisProgress.tsx` 同时渲染事件驱动气泡与完整文字阶段列表；`styles.css` 只负责表现和可停止动效。

## Conventions

- 阶段顺序来自 `TASK_EVENT_STAGES`，阶段状态只来自对应真实事件；未收到事件时使用 `not_reported`，不得推断 `pending`、完成度或结果状态。
- 重连时按 `event_id` 去重并保留输入流顺序。跨 `analysisId` 的事件和终态不能进入当前任务投影。
- 进入 S9 需要 controller 显式提供 `terminal.displayable=true`，表示同一任务已有已校验结果和匹配叙事；status 本身不构成展示证据。

## Gotchas & Decisions

- `persist_or_return:succeeded` 不等于结果已到达。只有同一 `analysisId` 的显式 `terminal` 输入才能结束 S8。
- `failed`、`cancelled`、`timed_out` 事件会立即停止循环动效，但不会自行生成终态或重试入口。
- 页面隐藏、组件离屏、连接中断、结果到达或减少动态效果开启时，循环动效必须停止。

## Commands

```sh
pnpm vitest run tests/analysis-progress
pnpm check
pnpm build
```
