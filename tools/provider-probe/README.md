# Provider Runtime Probe

本目录只用于 Issue #24 的供应商运行验收，不接入产品路径。工具从环境变量读取凭据，输出字段、时点、空值和类型化状态的脱敏摘要，不输出原始供应商响应、完整请求、Bearer token 或私人组合。

## 环境

- PandaAI 固定使用 Python 3.12 与 `panda-data==0.0.12`；该依赖在本机 Python 3.13 无法安装。
- Bocha 路径只使用 Python 标准库。
- 凭据通过 `PANDA_USERNAME`、`PANDA_PASSWORD`、`BOCHA_API_KEY` 注入。工具会在变量缺失时读取项目根目录中已被 Git 忽略的 `.env`；显式进程环境变量优先。不要把值作为命令行参数，也不要提交 `.env`。
- `PANDA_USERNAME` 使用数据服务登录名格式，即国家码 `86` 加手机号；裸手机号会被数据服务登录边界判为未注册。

使用 `uv` 的可复跑命令：

```powershell
$env:PANDA_USERNAME = Read-Host 'PandaAI username'
$env:PANDA_PASSWORD = Read-Host 'PandaAI password'
$env:BOCHA_API_KEY = Read-Host 'Bocha API key'
uv run --python 3.12 --with-requirements tools/provider-probe/requirements-panda.txt `
  python tools/provider-probe/probe.py --negative-tests
```

若根目录 `.env` 已配置上述三个变量，可直接执行最后一条 `uv run` 命令。

工具对每个 PandaAI 调用启动独立子进程并设置硬超时。SDK 的加密 `user.json` 被定向到单次临时目录；正常、失败和超时后均由父进程删除。Bocha 的 `count` 在发起网络请求前限制为 `1..50`。

## 输出语义

- `available`：本次真实调用返回至少一行或一项结果；不表示完整资产覆盖或稳定性承诺。
- `empty`：调用成功但返回零行，不能解释为零值或支持。
- `not_applicable`：固定 SDK 中没有目标导出或该调用不适用。
- `auth_failed`、`no_permission`、`rate_limited`、`timed_out`、`malformed`、`failed`：分别保留失败边界。
- `unit_evidence: not_declared_by_dataframe`：运行时表格未携带可核验单位，禁止仅凭字段名补写单位。

`--negative-tests` 会额外验证无效鉴权和本地硬超时。它不会主动制造限流。未实际观察到的供应商状态必须在验收文档中保持为“未观察”，不能写成通过。

## 离线测试

```powershell
py -3.13 -m unittest discover -s tools/provider-probe -p 'test_*.py' -v
```

测试覆盖脱敏、`count > 50` 本地拒绝、畸形响应、鉴权失败、缺少凭据和一手来源域名白名单。测试不发起供应商请求。
