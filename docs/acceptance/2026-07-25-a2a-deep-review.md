# A2A 深度复盘本地运行验收

- 日期：2026-07-25（UTC+8）
- 分支：`codex/a2a-deepseek-agent`
- 候选：未提交工作树；不能替代最终 commit 或公网验收
- 目标：`http://127.0.0.1:8791`
- 数据：仓库虚构示例组合或无持仓文本任务
- 凭据：仅从未跟踪的本机 `.env` 读取，未写入本记录、Card、响应摘要或 Git

## 赛事自测台

使用 `C:\Users\w2278\Desktop\check` 安装包中的 `runAgentDiagnostics`，上传/粘贴从本机服务获取的单张 Card JSON，并执行 Bearer 鉴权的普通调用。流式检查未启用，因为 Card 明确声明 `streaming: false`。

| 检查 | 结果 | 脱敏证据 |
|---|---|---|
| Agent Card 输入 | Passed | 单张 JSON Card |
| Card 校验 | Passed | A2A 1.0、`HTTP+JSON`、1 个 Skill、text/json output modes |
| 普通 A2A 调用 | Passed | 真实 DeepSeek 调用约 129971 ms |
| 5 分钟响应上限 | Passed | 普通调用低于 300000 ms |
| 流式调用 | Skipped | Card 未声明 streaming，不是基础门槛 |
| 参评声明 | Updated / not re-probed | 已切换为火山方舟 DeepSeek-Pro Endpoint ID `ep-20260708162855-pcf9x`；仍需用安全配置的 `ARK_API_KEY` 重跑真实调用 |

自测台的本地 service-URL 发现路径在其远程 Card 二次校验时没有继续传递 `allowPrivate`，因此本次使用自测台同样支持的“上传/粘贴 JSON”入口完成本机预检。公开 HTTPS Card 不依赖该本机例外。

## 深度工具循环

使用版本化虚构示例 `supported_full` 通过 A2A 普通调用提交自然语言任务和 `PortfolioSnapshot`：

- HTTP 200，`Content-Type: application/a2a+json`；
- Agent Message 含一个 text Part 和一个 JSON data Part；
- schema 为 `mandong.a2a.deep-review.v1`；
- 当前终态结构规定 provider 为 `Volcano Ark`、model 展示名为 `DeepSeek-Pro`、endpoint_id 为 `ep-20260708162855-pcf9x`；该字段结构已通过本地测试，但本节历史真实调用发生在 Ark 切换前；
- 4 个模型步骤依次成功调用 `inspect_context`、`collect_market_evidence`、`derive_portfolio`、`finalize`；
- 服务端记录 2 条行情证据和 10 项确定性派生；
- 最终状态按实际证据降级为 `limited`，没有伪装成完整支持；
- 总调用约 46 秒，低于 15 分钟硬截止。

该次记录来自数据授权 hardening 之前的候选实现，只证明工具循环与降级装配，不再作为最终候选的数据授权或数据源证据。当前候选不会回退该第三方行情路径。

## 仓库验证

- Ark 配置与终态结构变更后的 A2A/config 定向测试：14/14 通过；
- `pnpm check`：通过；
- `pnpm build`：通过；
- `pnpm test`：263 通过、1 个 Windows 上按设计跳过的 POSIX mode 断言；
- 首次并行执行 build/test 时有一个既有 UI 测试因 5 秒模块加载上限超时；单独复跑和随后顺序全量复跑均通过，不计为功能通过的唯一证据；
- `deploy/validate.sh`：当前 Windows 未完成目标 Linux 工具链验收，须在部署主机复跑。

本记录没有验证公网 HTTPS、最终 commit 绑定、生产 Bearer 分发、Nginx 930 秒路径、服务重启/取消或正式 Portal 声明。

## 赛道材料强化（已验证）

- Agent Card 增加三项代表性示例任务；
- 终态 Data Part 增加 `skills_used`、`data_sources` 与服务端固定 `risk_notice`；
- 文本 Part 无条件附加相同风险提示；
- 模型候选总结含隐私载荷、收益保证或精确交易指令时拒绝展示并使用确定性降级汇总；
- 能力矩阵、提交示例与剩余硬门槛记录于 `docs/competition/pandaai-a2a-readiness.md`；
- 开源参考与取舍记录于 `docs/research/pandaai-track-agent-references.md`。
- A2A 生产组合在 PandaAI 授权 Data Skills 未接通时使用 `UnconfiguredAuthorizedMarketEvidenceSource`：只生成 `failed` 证据，不发起未授权第三方行情请求。

验证结果：

- 定向 A2A/config 测试：14/14 通过；
- `pnpm check`：通过；
- `pnpm build`：通过；
- `pnpm test`：263 通过、1 个 Windows 上按设计跳过的 POSIX mode 断言；
- 最终本地候选：`http://127.0.0.1:8793`；Card 含 3 个示例；
- 赛事官方检查器：Card、A2A 1.0 `HTTP+JSON`、普通 Bearer 调用与 5 分钟响应门槛通过，普通调用约 20685 ms；streaming 按 Card 声明跳过；
- 真实 DeepSeek 文本任务：HTTP 200、2 步、`inspect_context` + `finalize`、约 23 秒，文本和 Data Part 均有风险提示；
- 真实 DeepSeek 组合任务：HTTP 200、4 步、四个工具均执行、约 37 秒；未配置授权数据源时两条证据均为 `failed`，`data_sources` 明确为 `a2a-market-data-unconfigured`，终态为 `unavailable`，没有制造当前值或完整复盘。

以上真实模型记录来自切换火山方舟前的旧直连接入，只证明受控循环与降级路径，不证明当前 Ark Endpoint 可用。当前 Ark 配置改动完成后，必须用不进入日志的 `ARK_API_KEY` 重新运行 capability call 和赛事检查器，才能更新为最终验收证据。

当前仍未验证公网 HTTPS、最终 commit 绑定、生产 Bearer 分发、Nginx 930 秒路径、服务重启/取消或正式 Portal 声明。
