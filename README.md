# 满懂

满懂是面向年轻投资者的每日持仓复盘产品。它把用户确认的基金、ETF 和少量 A 股持仓、四项个人约束，以及截至最新完整交易日的带时点证据，整理成一份可阅读、可翻面核对的每日复盘报告。产品只提供证据支持的方向性建议，不预测涨跌，不给出精确交易指令，也不替用户操作。

仓库名继续使用 `finlens`；用户界面、演示和对外材料统一使用“满懂”。

技术基线、模块地图、工作流和红线见 [`AGENTS.md`](AGENTS.md)。

## 本地运行

要求 Node `>=22 <23` 与 pnpm `10.33.2`。先复制 `.env.example` 为本地 `.env`（如需改端口），不要填入或提交真实凭据。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm start
```

`pnpm start` 服务已构建的 `dist/server/index.js`，默认监听 `http://127.0.0.1:8787`。`pnpm dev` 启动 Vite 客户端，`pnpm dev:server` 在本地观察 Hono 服务端。
