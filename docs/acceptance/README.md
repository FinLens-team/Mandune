# 满懂公开验收

本目录用于把一个候选 commit、一个普通公开 URL 和实际浏览器证据绑定起来。它不提供隐藏评委路由，不把 fixture、开发服务器或计划文档当成公开部署完成证据。

## 自动化范围

`tests/e2e` 从无 Cookie 的普通入口执行：

- desktop Chromium（1280x800）；
- 375x812 触控视口，并启用浏览器 `prefers-reduced-motion: reduce`；
- S1-S10 随机体验主路径（S0 不渲染）、未开放入口、工作区状态、90/180 秒提示、真实任务事件、观象/证据正反面、刷新恢复、历史重放和回访跳过引导；
- 每个关键屏的横向溢出检查；
- `console.error`、page error、请求失败和意外 HTTP 4xx/5xx 检查；
- URL、DOM、Web Storage、请求载荷、Cookie 属性、`/health`、敏感路径、客户端 secret 形态和 sourcemap 暴露检查。

首次无 Cookie 访问时，客户端会先用 `GET /api/workspaces/current` 探测当前工作区。套件只允许该路径的第一次 GET 返回一次 401；同路径后续 401 或任何其它失败响应都不在白名单。
测试主动 reload 时，浏览器可能把尚未完成的同一路径 GET 标为
`net::ERR_ABORTED`；套件只忽略这一精确的幂等探测取消，其它请求失败仍会阻断验收。

当前普通随机体验路径确定性证明的是它实际返回的状态。`limited`、`observation_only`、`unavailable`、180 秒截止、外部供应商失败、主机日志、任务进程清理和回滚必须由普通公开入口或运维演练单独留证。没有可达入口时写“未验证”，不得用路由拦截、mock 或隐藏参数制造通过。

## 运行

前置条件：Node 22、pnpm 10.33.2，以及候选 URL 已部署并通过 HTTPS 提供服务。

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
E2E_TARGET_URL=https://demo.example.com \
E2E_EXPECTED_VERSION=<candidate-commit-sha> \
pnpm test:e2e
```

已安装系统 Chrome 时可避免下载浏览器：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
E2E_TARGET_URL=https://demo.example.com \
E2E_EXPECTED_VERSION=<candidate-commit-sha> \
pnpm test:e2e
```

`E2E_TARGET_URL` 必须是无用户名、密码、路径、查询和 hash 的 HTTPS origin。`E2E_EXPECTED_VERSION` 必须与该候选的 `/health.version` 精确相等。不得把 token、工作区 locator 或供应商凭据放进 URL。仅限本地预检可显式使用：

```sh
E2E_ALLOW_INSECURE_LOCALHOST=1 \
E2E_TARGET_URL=http://127.0.0.1:8787 \
pnpm test:e2e --grep-invert "public health and static artifacts"
```

HTML 报告输出到 `playwright-report/`，失败 trace、截图和视频输出到 `test-results/e2e/`。这些目录已被 Git 忽略。报告可能含浏览器内的示例持仓，不得公开上传；提交材料只保留脱敏截图、结论和报告摘要。

## 候选绑定

1. 记录候选 commit SHA、部署时间、目标 URL 和执行人。
2. 确认 `GET /health` 的 `version` 等于候选 SHA 或发布方定义的精确 release ID。
3. 从新的无痕上下文执行完整套件；不要复用个人浏览器 profile。
4. 按 [证据模板](evidence-template.md) 填写自动化结果和人工/运维证据。
5. 失败后部署修复候选，重新执行完整矩阵；不要覆盖原失败记录。

## 结果判定

- 自动化命令退出 0 只能证明该 URL 在该次执行中覆盖到的浏览器行为。
- 公网完成还要求 HTTPS、候选版本绑定、日志隐私、硬截止任务清理和回滚演练证据。
- 截图、视频、trace、日志摘录只使用虚构最小数据，并在分享前检查 Cookie、请求头、路径、主机用户和凭据。
- Qoder 会话或未合并分支不替代最终 commit、公开 URL 和真实浏览器结果。
