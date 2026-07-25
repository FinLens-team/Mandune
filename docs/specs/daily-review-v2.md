# 每日复盘 V2 实施规格

- 状态：用户已确认，可实施
- 确认日期：2026-07-25
- 优先级：本规格记录本轮用户确认的行为合同；与旧产品或 Demo 规格冲突时，以本规格为准
- 安全边界：本文不记录任何账号、密码、API key 或 credential-bearing URL

## 1. 目标

用户主动触发每日复盘后，服务端围绕冻结的完整持仓快照完成以下闭环：

1. 确定触发时最新完整交易日及前一交易日；
2. 优先读取本地市场与事件缓存，缓存缺失或需要刷新时调用真实供应商并写回缓存；
3. 确定性计算今日变化、盈亏贡献、敞口、风险与集中度；
4. 使用 Bocha 发现相关事件，并按官方优先、可信媒体分级的规则形成事件证据；
5. 把确认输入、证据和派生结果组装为版本化 `ReviewPacket`；
6. 将核心持仓分析 skill、当前选中的一个人格 skill 和 `ReviewPacket` 通过一次 `step-explore` 调用生成完整结果；
7. 校验并保存理性背面、人格正面和两张图鉴卡，供现有 API、历史和前端消费。

不引入自主 Agent、工具循环或多 Agent 编排。模型只执行一次受约束的文本生成；结构失败最多重试一次。

## 2. 已确认产品决策

### 2.1 数据时点

- “实时”表示用户触发时实时拉取最新可获得的完整交易日数据。
- 不承诺 A 股盘中实时行情。
- 同一次复盘冻结一个最新完整交易日，所有对比与报告使用同一时点。

### 2.2 资产范围

- 首版真实路径覆盖 A 股、ETF 和场外基金。
- 每项持仓独立取数；一项接口异常不阻断其他持仓。
- 后端保留逐项覆盖与失败状态，防止部分数据被误当成完整数据。
- 用户界面不出现“降级”“limited”“observation_only”等术语。
- 部分数据失败时，用户看到“部分数据暂时未获取，本次内容基于已获得的信息”及具体缺失项。
- 全部市场数据失败时不调用模型，用户看到“数据接口异常，本次复盘未完成”及重试入口。

### 2.3 事件来源

- 官方公告、监管机构、交易所、基金管理人和上市公司来源优先。
- 可信财经媒体可以作为明确标注的次级来源。
- Bocha 标题和摘要只用于发现候选，不自动成为已核验事实。
- 事件来源无法读取或相关性不足时，保留为未核验候选，不支撑事实性结论。

### 2.4 模型与调用方式

- 唯一目标模型为 `step-explore`，不自动切换到其他模型。
- 首先验证给定 Step Plan 端点上的模型可用性和 JSON Mode。
- JSON Mode 可用时发送 `response_format: {"type":"json_object"}`。
- JSON Mode 不可用时仍只调用 `step-explore`，改为提示词强制 JSON、严格解析和一次重试。
- 默认一次调用同时生成理性背面、人格正面和两张图鉴卡。
- 不采用三个模块并行调用；若未来单次质量不能满足验收，另行决定是否改为两次串行。

### 2.5 扫盲与图鉴

- Day 1-10 按最新完整交易日确定，同一交易日重复复盘使用同一组词。
- 每次成功报告生成两张图鉴卡：一个简单名词和一个技术指标。
- 图鉴卡可以结合当前持仓举例，但不得新增证据包中不存在的金融事实。

## 3. 外部接口事实

### 3.1 PandaAI

- 官方文档：`https://www.pandaaiquant.com/data-service/api-docs?api=data_fetch_doc`
- Token 认证通过 `panda_data.init_token(username, password)` 完成。
- 数据服务账号使用国家码 `86` 加官网注册手机号。
- PandaAI 数据服务以历史数据集为边界，不作为 A 股盘中行情源。
- 官网资料同时出现 `get_*` 和 `pd_get_*` 两套方法命名；生产实现必须以实际安装 SDK 的导出和真实响应为准。
- 候选能力包括交易日历、A 股/ETF 日线、基金基本信息、基金净值和行业信息；每个方法、资产类型和字段都需要运行探测。

### 3.2 Bocha

- 文档：`https://aq6ky2b8nql.feishu.cn/wiki/HmtOw1z6vik14Fkdu5uc9VaInBb`
- Web Search：`POST https://api.bocha.cn/v1/web-search`
- Bearer 鉴权；`count` 本地限制为 `1..50`。
- 首版每项持仓请求 3-5 个候选，组合去重后最多核验 10 个来源。

### 3.3 Step Plan

- 接入文档：`https://platform.stepfun.com/docs/zh/step-plan/integrations`
- Base URL：`https://api.stepfun.com/step_plan/v1`
- Chat Completion：`POST /chat/completions`
- 采用 OpenAI-compatible transport。
- 模型 `step-explore` 是账号可用的内测模型，其 JSON Mode、最大输出和 finish reason 行为必须实测。

## 4. 目标数据流

```text
PortfolioSnapshot
  -> TradingDayResolver
  -> MarketEvidenceCache
       -> PandaBatchWorker (cache miss / refresh)
       -> write observations
  -> EventEvidenceCache
       -> BochaSearch (cache miss)
       -> SourceFetcher + relevance verification
       -> write candidates/documents
  -> DailyReviewDeriver
       -> daily changes / contributions / exposure / concentration / gaps
  -> ReviewPacketBuilder
  -> PromptCompiler
       -> policy guard
       -> core analysis skill
       -> selected persona skill
       -> ReviewPacket
  -> StepExploreGenerator (one call, at most one retry)
  -> GeneratedReviewValidator
  -> immutable history + API response
  -> front / back / encyclopedia cards
```

## 5. 缓存设计

### 5.1 市场观察

建议新增 `market_observations`：

- `provider`
- `method`
- `asset_class`
- `symbol`
- `trading_day`
- `status`
- `payload_json`
- `observed_at`
- `fetched_at`
- `content_hash`
- `last_error_code`

唯一键为 `(provider, method, asset_class, symbol, trading_day)`。

- 最近三个交易日每天允许刷新一次，以接收修订数据。
- 更早历史默认直接复用。
- 失败记录使用短有效期，避免一次任务内重复请求，同时允许之后恢复。

### 5.2 资产资料

建议新增 `asset_profiles`，缓存名称、类型、市场、行业和供应商身份字段，默认七天刷新。

### 5.3 事件搜索与来源

建议新增：

- `event_searches`：按规范化查询哈希和时间窗口缓存，默认六小时；
- `event_candidates`：候选标题、URL、站点、发布时间和相关性状态；
- `source_documents`：URL、来源等级、获取时间、正文摘要、内容哈希和核验状态，默认二十四小时刷新。

### 5.4 并发控制

- SQLite 唯一键保证幂等写入。
- Node 进程内使用 single-flight 合并相同缓存键的并发请求。
- 整份复盘历史不是供应商缓存；历史记录不可被后续数据刷新改写。

## 6. PandaAI 运行边界

- Node 每次复盘最多启动一个 Python 3.12 批处理子进程，而不是每项持仓启动一个进程。
- 子进程通过 stdin 接收不含凭据的 JSON 请求，通过 stdout 只返回规范化 JSON。
- 凭据只从子进程环境读取，不出现在命令行、日志、测试 fixture 或响应。
- 子进程在调用级临时目录中初始化认证状态；成功、失败、取消和超时都删除认证残留。
- Node 为整个批处理设置硬超时，超时后终止任务自有进程组。
- 供应商 DataFrame 字段在 Python 边界规范化，Pandas 和 PandaAI SDK 类型不进入 TypeScript 领域契约。

## 7. 确定性派生

模型调用前必须由应用代码计算：

- 当前和前一完整交易日的观察值；
- 单项涨跌额与涨跌幅；
- 在持仓数据足够时计算单项当日盈亏贡献；
- 组合当日盈亏及比例；
- 最大贡献项与最大拖累项；
- 资产类别和行业敞口；
- 单项、行业和前 N 项集中度；
- 用户四项约束与已知风险之间的关系；
- 缺失资产、缺失指标和接口失败项；
- 当日两个扫盲词。

缺少金额、份额、成本或权重时不得估算无法复算的盈亏贡献，只输出可确认的价格或净值变化。

## 8. ReviewPacket

`ReviewPacket` 至少包含：

- schema 和 prompt 版本；
- 快照 ID、最新完整交易日和证据截止时间；
- 全部确认持仓和四项约束；
- 逐项市场观察、变化和贡献；
- 组合汇总、敞口、集中度和风险；
- 已核验事件和未核验候选的明确区分；
- 缺失项与接口失败项；
- 两个扫盲词及其可用数据；
- 可引用的 `fact_ids`、`event_ids` 和允许出现的金融数字清单。

## 9. Skill 与 Prompt Compiler

四份 FINAL skill 原文作为版本化 prompt 资产保存，不直接修改：

- `持仓分析-skill`
- `奶龙转述-skill`
- `孙哥转述-skill`
- `兜兜转述-玄学版-skill`

调用时只注入核心分析 skill 和当前选中的一个人格 skill。Prompt 优先级：

1. 应用级事实、安全和输出约束；
2. 核心持仓分析 skill；
3. 当前人格 skill；
4. `ReviewPacket`。

应用级约束覆盖 skill 示例中与规则冲突的投资引导、预测或未提供数字。FINAL 文件保持原样，覆盖只发生在调用层。

## 10. 模型输出

目标 schema：

```json
{
  "schema_version": "generated-daily-review.v2",
  "rational_report": {
    "markdown": "...",
    "fact_ids": ["..."] ,
    "event_ids": ["..."]
  },
  "themed_report": {
    "persona_id": "...",
    "markdown": "...",
    "fact_ids": ["..."],
    "event_ids": ["..."]
  },
  "encyclopedia_cards": [
    {
      "term_id": "...",
      "title": "...",
      "summary": "...",
      "body_markdown": "...",
      "related_line_ids": ["..."],
      "fact_ids": ["..."]
    }
  ]
}
```

必须恰好返回两张图鉴卡。

## 11. 输出校验

展示和保存前必须通过：

- JSON/schema/version 校验；
- finish reason 完整性校验；
- `fact_ids`、`event_ids`、`line_ids` 引用存在性校验；
- 正反面引用集合与关键事实一致性校验；
- 金融数字必须来自 `ReviewPacket` 的允许数字清单；
- 禁止精确交易指令、收益保证、代客操作和不存在的事实；
- 当前人格与 `persona_id` 匹配；
- 两张图鉴卡与当日轮播词匹配；
- 输出不含凭据、身份、账户信息或模型 reasoning 字段。

首次失败可以使用同一模型和修复提示重试一次。第二次失败后不展示或保存未校验文本。

## 12. 历史与前端

历史记录新增保存：

- 冻结快照和全部证据；
- 确定性派生结果；
- `ReviewPacket` 版本；
- 模型、prompt 和两份 skill 的版本/哈希；
- 已校验的理性报告、人格报告和图鉴卡；
- 覆盖与接口失败明细。

前端：

- 正面消费 `themed_report.markdown`；
- 背面消费 `rational_report.markdown`、确认输入、派生结果和证据；
- 报告底部消费 `encyclopedia_cards`；
- 部分数据失败使用自然语言说明，不展示内部状态枚举；
- 全部接口异常时不进入正常报告页。

## 13. 实施顺序

1. 用公开测试资产完成 PandaAI、Bocha 和 `step-explore` 脱敏能力探测；
2. 新增 V2 契约、缓存迁移和 Store；
3. 实现 Panda Python 批处理和 Node 适配器；
4. 实现 Bocha 搜索、来源抓取、分级和事件缓存；
5. 实现交易日解析、今日对比与集中度派生；
6. 接入 FINAL skill、Prompt Compiler、`ReviewPacket` 和一次结构化生成；
7. 扩展历史、HTTP API 和前端消费；
8. 完成正常、部分接口失败、全部失败、缓存命中、重试、超时、历史重放和凭据扫描验证。

## 14. 验收标准

- 缓存命中时不调用对应供应商；缓存缺失时调用并原子写回。
- 同一批持仓只初始化一次 PandaAI 会话。
- A 股、ETF、场外基金逐项产出可用数据或明确失败记录。
- 同一输入的今日对比和集中度计算可复算。
- Bocha 摘要不自动成为已核验事实；官方与媒体来源等级可见。
- 部分接口失败仍可生成基于现有数据的报告，且不暗示完整覆盖。
- 全部市场数据失败时模型调用次数为零。
- `step-explore` 一次成功调用产出理性背面、人格正面和恰好两张图鉴卡。
- 模型返回新数字、无效引用、交易指令、错误人格或畸形 JSON 时不展示；最多重试一次。
- 同一交易日的扫盲词固定，跨日按 Day 1-10 推进。
- 历史重放不重新请求供应商或模型。
- 仓库、日志、任务事件、测试和生成结果不含凭据。

## 15. 非目标

- 盘中实时行情和持续监控；
- 自主 Agent、工具调用循环或多 Agent 协作；
- 模型负责数据获取、缓存选择或金融计算；
- 用 Bocha 摘要替代来源核验；
- 自动切换到 `step-explore` 之外的模型；
- 修改四份 FINAL skill 原文。
