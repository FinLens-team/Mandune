# PandaAI A2A 赛道能力与提交就绪度

- 日期：2026-07-25（UTC+8）
- 分支：`codex/a2a-deepseek-agent`
- 结论：**技术形态可以参与；正式提交的唯一基础设施硬阻塞是公开 HTTPS 稳定部署。当前 A2A 已对未配置的数据源 fail closed，不访问未授权第三方，但若不接入 PandaAI 授权 Data Skills，金融任务完成度和赛道竞争力会明显受限。**

## 能力测试矩阵

| 赛道要求 / 风险 | 当前证据 | 还要测试或补齐 |
|---|---|---|
| A2A Remote Agent | `/.well-known/agent-card.json` 与 `/a2a/message:send`；赛事检查器 Card/普通调用通过 | 公网 HTTPS 再跑同一检查器 |
| A2A 1.0 / HTTP+JSON | Card 明确声明协议与 binding | 用最终公网 Card 固化响应样例 |
| 独立鉴权 | A2A Bearer 与模型 API key 分离，缺配置 fail closed | 生产 token 分发、轮换与错误码检查 |
| 指定 DeepSeek-Pro | 火山方舟提供商、展示名与 Endpoint ID 分离；请求 `model` 固定为 `ep-20260708162855-pcf9x`，凭据只读 `ARK_API_KEY` | 用赛事 Ark Token 做最终 capability call 和公网响应抽查 |
| 自然语言任务 | 支持 1-4000 字文本任务 | 用三类示例任务做公网回归 |
| 复杂任务与工具调用 | 最多 8 步；上下文、行情证据、确定性派生、最终汇总四个工具 | 覆盖工具拒绝、失败、超时和重复调用 |
| 可解释过程 | `execution.tools` 记录时间、状态与摘要；`skills_used` 汇总实际工具 | 确认日志与响应不出现思维链或私人载荷 |
| 数据来源透明 | `evidence` 保留来源与双时点；`data_sources` 汇总实际来源和证据 ID；未配置授权源时记录 `a2a-market-data-unconfigured/failed`，不访问腾讯或其它第三方行情 | 接入 PandaAI 授权 Data Skills 后补资产/字段/时点/限流/错误矩阵 |
| 结果结构清晰 | 文本 Part + `mandong.a2a.deep-review.v1` Data Part | 用提交文档展示一份脱敏正常/有限结果 |
| 风险提示 | 服务端固定 `risk_notice`，文本 Part 也强制附带 | 公网响应抽查每次均存在 |
| 内容边界 | 拒绝凭据/身份/账户载荷；候选总结若含收益保证或精确交易指令则回退 | 增加更多中英文越界语料回归 |
| 20 分钟总响应 | 产品硬截止 15 分钟；本地真实调用约 46 秒和约 130 秒样例均通过 | 公网代理、供应商慢响应和取消测试 |
| 至少 3 个示例任务 | Card 已列三例；路由测试逐例验证可接受 | 最终公网真实跑三例并保存脱敏结果 |
| 稳定在线 | 本地服务与构建通过 | **公开部署、健康检查、重启恢复和评审期监控未完成** |
| 说明文档 | 本文、ADR-0010、分析契约、验收记录与开源参考 | 补团队、架构图、最终 URL、鉴权说明和结果截图 |
| 演示视频 / GitHub / Portal | 尚未完成 | 用最终 commit 和公开 URL 录制并从无痕窗口验证 |

## 三个提交示例任务

### 1. 文本边界与上下文总结

> 请总结本次任务的已知上下文、未知项和需要补充的信息，不要假设持仓。

预期：调用 `inspect_context` 和 `finalize`；状态为 `observation_only`；不虚构组合；输出风险提示。

### 2. 有限组合深度复盘

> 请检查已提交的体验组合，汇总证据、确定性派生、未知项与方向性观察。

预期：仅查询快照内资产；调用行情与派生工具；证据或约束不完整时返回 `limited`，并列出 `skills_used` 与 `data_sources`。

### 3. 缺失/过期/不支持降级

> 如果部分行情过期、不支持或失败，请明确降级状态、受影响判断和恢复动作。

预期：不制造当前值；保留失败/过期/不支持状态；进入 `limited`、`observation_only` 或 `unavailable`；不显示外观正常的完整结论。

## 提交架构

```text
PandaAI 评审平台
  -> HTTPS Agent Card
  -> Bearer A2A HTTP+JSON
  -> 输入与隐私校验
  -> 火山方舟 DeepSeek-Pro / ep-20260708162855-pcf9x（最多 8 步）
       -> inspect_context
       -> collect_market_evidence（仅快照内授权资产）
       -> derive_portfolio（确定性）
       -> finalize
  -> 服务端内容边界 + 风险提示
  -> 文本 Part + 版本化 Data Part
```

## Skills 与数据列表

- Agent Skill：`mandong-deep-review-v1`
- 内部工具：`inspect_context`、`collect_market_evidence`、`derive_portfolio`、`finalize`
- 模型：火山方舟 `DeepSeek-Pro`
- 模型接入点：`ep-20260708162855-pcf9x`（请求中的 `model`，不是 Token）
- 模型凭据：仅服务端 `ARK_API_KEY`，与 A2A 调用 Bearer 分离
- 结构化数据：最终提交必须填写实际获授权的 PandaAI Data Skills/方法；当前不能用方法名或申请状态替代运行证据
- 投研能力：确定性覆盖、持仓类别计数、已确认约束状态、未知项与限制派生
- 未使用：券商连接、下单、自动调仓、实时监控、跨任务记忆、浏览器私人工作区

## 提交前硬门槛

- [ ] 为提高金融任务完成度，接入赛事授权 PandaAI Data Skills，并完成资产/字段/时点/限流/错误矩阵；接入前继续 fail closed。
- [ ] 部署公开 HTTPS Card 与服务 URL，验证评审期稳定在线。
- [ ] 用最终公网环境真实跑三个示例，单例均低于 20 分钟并保存脱敏响应。
- [ ] 测试取消、15 分钟截止、上游超时、限流、空结果和服务重启。
- [ ] 提交文档补齐团队、鉴权交付方式、架构、Skills、结果展示、GitHub/邮件材料。
- [ ] 录制最终分支演示视频，并核对必要风险提示始终可见。
- [ ] 立即轮换任何曾在聊天或屏幕中明文出现过的 API key，不把旧 key 用于公开部署。

## 最新官方资源核对

- 火山方舟官方 Node SDK `@volcengine/ark-runtime@1.0.10` 的运行时代码确认：默认 Base URL 为 `https://ark.cn-beijing.volces.com/api/v3`，API key 使用 `Authorization: Bearer ...`，并默认读取 `ARK_API_KEY`。
- PandaAI 数据权限领取页：<https://www.pandaaiquant.com/data-service>。领取说明不等于已完成账户、方法和资产运行验收。
- QuantSkills：<https://github.com/quantskills>。与当前复盘最直接相关的是 GPL-3.0 的 `skill-pandadata-api`：它封装 `panda_data==0.0.12`、Python 3.10+、本地 Skill/CLI 和 218 个接口参考，不是可直接从当前 Node 单包调用的托管 HTTP 服务。
- 因当前生产基线只承诺 Node 22，且尚未取得 PandaAI 登录凭据、服务 Base URL 与运行方法矩阵，本分支不引入 Python sidecar、GPL 源码或未验收网关。A2A 行情继续 fail closed；后续接入须单独确认部署 Python 运行时/进程边界、凭据存储、许可证义务，以及 A 股、ETF、基金方法的字段与错误矩阵。
