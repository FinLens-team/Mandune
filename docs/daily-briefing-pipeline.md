# 满懂日报每日预生成流程

## 目标

每天在用户发起持仓复盘前，准备一组带来源的公开市场日报。用户等待思考模型时阅读日报；日报不读取用户持仓，也不替代本次个性化复盘。

## 生成顺序

1. 确定日报日期和市场行情截止日。休市日必须沿用最近交易日，并明确标注。
2. 从交易所、监管机构和可信媒体采集公开事实，形成唯一事实底稿。每个市场数字和新闻条目必须引用来源；无法核验的内容不进入底稿。
3. 为新闻标记发布时间、重要性和关联资产。不得把新闻发布时间、抓取时间和行情观察时间混为一个字段。
4. 基于同一事实底稿生成 7 个主题版本：`eastern_observation`、`jixing_doudou`、`sunge`、`zhouli`、`tieba_laoge`、`male_succubus`、`female_succubus`。
5. 角色版本只改变 `title`、`dek` 和 `sections`；`fact_sheet_id`、`market`、`news`、`sources`、截止时间和免责声明必须完全一致。
6. 贴吧版本不得包含群体羞辱；魅魔版本不得包含露骨成人内容。等待页可能在公共场景展示。
7. 将文件写入 `src/client/public/daily-briefings/YYYY-MM-DD/`。
8. 执行 `pnpm daily-briefings:publish YYYY-MM-DD`。只有 7 份文件全部通过校验且事实底稿逐字一致时，脚本才会原子更新 `latest/`。

## JSON 合约

```json
{
  "schema_version": "daily-briefing.v2",
  "fact_sheet_id": "cn-market-YYYY-MM-DD-r1",
  "date": "YYYY-MM-DD",
  "generated_at": "ISO-8601 timestamp",
  "market_data_cutoff": "明确日期与时点",
  "theme_id": "主题 ID",
  "title": "角色版标题",
  "dek": "角色版导语",
  "market": [
    {
      "label": "深证成指",
      "value": "13578.93",
      "change": "+2.21%",
      "observed_at": "YYYY-MM-DD 15:00",
      "source_id": "source-id"
    }
  ],
  "news": [
    {
      "title": "新闻标题",
      "summary": "只陈述可核验事实及必要边界",
      "published_at": "YYYY-MM-DD",
      "source_id": "source-id",
      "importance": "high",
      "related_assets": ["资产类别"]
    }
  ],
  "sections": [
    { "heading": "角色版小标题", "body": "角色版解释" }
  ],
  "sources": [
    { "id": "source-id", "name": "来源名称", "url": "https://..." }
  ],
  "notice": "日报基于公开市场信息预先生成，不使用你的持仓数据，不构成个性化投资建议。"
}
```

## 内容与失败策略

- 任一主题缺失、JSON 损坏、来源引用断裂、事实底稿不一致、日期不符或免责声明缺失：整批拒绝发布，保留上一版 `latest/`。
- 客户端读取失败：显示不含市场数字和新闻的内置降级文章，不影响复盘任务。
- 当天没有可靠市场材料：允许 `market` 或 `news` 为空，但禁止为了“每日更新”编造行情、新闻或因果。
- 市场涨跌与新闻并列展示不代表因果关系；除非一手来源明确说明，不写“某新闻导致指数上涨”。
