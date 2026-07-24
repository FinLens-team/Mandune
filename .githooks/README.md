# Git 提交信息规范

FinLens 使用版本化的 `commit-msg` Hook，要求每次提交使用规范主题并提供包含中文的正文说明。该规则适用于普通提交、合并提交和回滚提交，不自动豁免 Git 生成的消息。

## 启用

在仓库根目录执行：

```powershell
git config core.hooksPath .githooks
```

该配置只影响当前仓库。克隆仓库后需要重新执行一次。

## 格式

```text
<type>(<scope>): <中文主题>

背景：
- 说明为什么需要这次变更，以及当前问题或决策依据。

变更：
- 说明实际修改的行为、契约、代码或文档。

验证：
- 说明执行过的检查、测试及其结果。
```

允许的 `type`：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`。`scope` 可省略；填写时只使用小写字母、数字、点、下划线、斜杠或连字符。

主题和正文都必须包含中文，但可以同时使用英文术语。正文可以使用段落、列表或其他自由格式；Hook 不要求“背景：”“变更：”“验证：”结构，不检查总字数或单条说明长度。主题后必须是真实空行，提交信息文件必须以真实换行结束。

不要在参数中写字面量 `\n`。在 PowerShell 中需要脚本化提交时，可使用保留真实换行的 here-string：

```powershell
$commitMessage = @'
docs(architecture): 记录架构决策

背景：
- 已完成决策证据收集，需要让后续实现能够核对选择依据。

变更：
- 新增架构决策文档，并同步相关产品契约和项目知识。

验证：
- 检查文档引用、差异格式和敏感信息扫描结果。
'@

git commit -m $commitMessage
```

## 测试

PowerShell 中执行：

```powershell
powershell -ExecutionPolicy Bypass -File .githooks/test-commit-msg.ps1
```

macOS、Linux 或已经将 `sh` 加入 `PATH` 的 Git for Windows 环境中执行：

```sh
sh .githooks/test-commit-msg.sh
```

PowerShell 包装器会优先使用 `PATH` 中的 `sh`，否则自动定位 Git for Windows 自带的 `bin/sh.exe`。测试覆盖结构化正文和自由格式中英混合正文，以及字面量 `\n`、主题或正文不含中文、缺少主题后空行和缺少文件末尾换行等无效示例。
