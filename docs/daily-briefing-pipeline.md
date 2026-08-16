# 满懂日报流水线

等待页日报是独立于持仓复盘的公开市场内容。它不读取工作区、持仓、金额、个人约束或历史报告，也不参与组合评分。用户发起复盘后可以在模型运行期间阅读日报，但最终报告仍以本次冻结快照和证据为准。

## 当前实现

生产 worker 位于 `src/daily-briefing/worker.ts`，使用 `daily-briefing.v2` 合约：

1. 按 `Asia/Shanghai` 确定日报日期。
2. 从腾讯日 K 接口读取上证指数、深证成指和创业板指最近三十个交易日。
3. 选择最近一个已完成交易日作为统一行情截止日。周末和休市日不会伪造同日收盘价。
4. 程序固定行情数字、观察时点、来源 URL、事实底稿 ID 和免责声明。
5. 模型网关只生成七种主题的 `title`、`dek` 和 `sections`；这些字段禁止出现阿拉伯数字，避免模型改写市场数值。
6. 七份文件全部通过合约校验且共享完全相同的 `market`、`news`、`sources`、日期和截止时间后，才原子更新 `latest/`。
7. 同一日期已经存在完整文件时默认复用；只有显式传入 `--force` 才重新生成。

七种主题为：

- `eastern_observation`
- `jixing_doudou`
- `sunge`
- `zhouli`
- `tieba_laoge`
- `male_succubus`
- `female_succubus`

当前自动采集器只发布三大指数行情，`news` 固定为空。旧的人工日报可能包含新闻，但 worker 不会把旧新闻复制到新日期，也不会为了让内容看起来“实时”而补写新闻、原因或预测。可核验新闻采集需要单独实现来源适配、发布时间与行情时点分离、引用校验和失败降级。

## 运行目录

动态日报是可变运行时状态，生产写入：

```text
/var/lib/mandong/daily-briefings/YYYY-MM-DD/*.json
/var/lib/mandong/daily-briefings/latest/*.json
```

服务通过 `/daily-briefings/` 读取该目录。`MANDONG_DAILY_BRIEFINGS_DIR` 必须是绝对路径，不能指向 `/opt/mandong/current`、不可变 release 或 Git 工作区。

本地开发可以使用被 Git 忽略的目录：

```dotenv
MANDONG_DAILY_BRIEFINGS_DIR=/absolute/path/to/Mandune/.localdata/daily-briefings
```

## 执行方式

先构建包含 worker 的服务端产物；本地使用 package script 运行当前日期：

```sh
pnpm build
MANDONG_DAILY_BRIEFINGS_DIR=/absolute/runtime/daily-briefings \
  pnpm daily-briefings:run
```

底层 worker 也可直接执行，并用于指定日期或强制重跑：

```sh
node --env-file-if-exists=.env dist/daily-briefing/worker.js 2026-08-16
node --env-file-if-exists=.env dist/daily-briefing/worker.js 2026-08-16 --force
```

生产由 `mandong-daily-briefing.timer` 在每天 `08:00 Asia/Shanghai` 唤醒，并附加最多五分钟随机延迟。`Persistent=true` 会在主机错过计划时间后补跑。查看状态：

```sh
sudo systemctl status mandong-daily-briefing.timer
sudo systemctl list-timers mandong-daily-briefing.timer
sudo systemctl start mandong-daily-briefing.service
sudo journalctl -u mandong-daily-briefing.service --since today
```

## JSON 合约

```json
{
  "schema_version": "daily-briefing.v2",
  "fact_sheet_id": "cn-market-YYYY-MM-DD-r1",
  "date": "YYYY-MM-DD",
  "generated_at": "YYYY-MM-DDTHH:mm:ss+08:00",
  "market_data_cutoff": "YYYY-MM-DD 15:00 Asia/Shanghai",
  "theme_id": "主题 ID",
  "title": "角色版标题",
  "dek": "角色版导语",
  "market": [
    {
      "label": "深证成指",
      "value": "13578.93",
      "change": "2.21%",
      "observed_at": "YYYY-MM-DD 15:00",
      "source_id": "source-id"
    }
  ],
  "news": [],
  "sections": [
    { "heading": "角色版小标题", "body": "只解释统一事实底稿" }
  ],
  "sources": [
    { "id": "source-id", "name": "来源名称", "url": "https://..." }
  ],
  "notice": "日报基于公开市场信息预先生成，不使用你的持仓数据，也不构成个性化投资建议。"
}
```

## 原子发布与失败策略

- 进程使用 `<root>/.lock` 防止并发生成，并清理已经失效的锁进程记录。
- 日期目录和 `latest/` 都先写入同级临时目录，再通过 rename 替换。
- 任一主题缺失、JSON 损坏、来源引用断裂、事实不一致、日期不符或免责声明缺失时，整批拒绝发布。
- 模型调用最多尝试三次；整次采集与生成有硬超时。
- 新批次失败时保留上一版 `latest/`。客户端若读取失败，则显示不含市场数字和新闻的内置降级文章。
- 行情截止日、日报日期与生成时间是三个不同字段。界面和文案不得把旧交易日数据写成当天实时收盘。

仓库中的 `scripts/publish-daily-briefings.mjs` 仍用于校验并发布人工准备的完整静态批次；它不替代生产 worker，也不会自动采集市场信息。
