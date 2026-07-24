#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
hook="$script_dir/commit-msg"
fixture_dir=$(mktemp -d "${TMPDIR:-/tmp}/finlens-hook-test.XXXXXX")
trap 'rm -rf "$fixture_dir"' EXIT HUP INT TERM

pass_count=0

expect_pass() {
  name=$1
  file=$2

  if "$hook" "$file"; then
    printf 'PASS 有效示例：%s\n' "$name"
    pass_count=$((pass_count + 1))
  else
    printf 'FAIL 有效示例被拒绝：%s\n' "$name" >&2
    exit 1
  fi
}

expect_fail() {
  name=$1
  file=$2

  if "$hook" "$file" >/dev/null 2>&1; then
    printf 'FAIL 无效示例未被拒绝：%s\n' "$name" >&2
    exit 1
  fi

  printf 'PASS 无效示例：%s\n' "$name"
  pass_count=$((pass_count + 1))
}

cat > "$fixture_dir/valid.txt" <<'EOF'
docs(architecture): 固化数据源与模型运行时决策

背景：
- 满懂的产品、分析和供应商边界已经由上游契约统一，需要保留可核对的提交记录。

变更：
- 对齐 Demo V1、分析契约、PandaAI 与 Bocha 候选集成边界，并保留版本化 Hook。
- 同步产品契约、交付票据、比赛材料和提交信息校验规则。

验证：
- 检查文档引用、敏感信息扫描、差异格式以及提交 Hook 的有效和无效示例。
EOF

cat > "$fixture_dir/literal-newline.txt" <<'EOF'
docs(architecture): 错误使用字面换行
\n背景：\n- 这不是提交信息中的真实换行，只是反斜杠字符和字母组合。
EOF

cat > "$fixture_dir/freeform-body.txt" <<'EOF'
docs(architecture): 允许自由格式正文

这里直接说明修改原因和结果，不使用背景、变更、验证标题，也不使用列表。English terms are allowed.
EOF

cat > "$fixture_dir/non-chinese-subject.txt" <<'EOF'
docs(architecture): document runtime decisions

背景：
- 当前技术决策需要通过结构化提交信息保留变更原因和验证依据。

变更：
- 增加提交信息格式校验，并记录各部分必须使用的标题和说明。

验证：
- 执行有效和无效示例，确认不符合中文主题要求的提交被拒绝。
EOF

cat > "$fixture_dir/escaped-blank-line.txt" <<'EOF'
docs(architecture): 主题后没有真实空行
背景：
- 当前示例故意省略主题和正文之间的空行，用于确认行结构校验生效。

变更：
- 保持正文内容完整，但让主题后的第二行不是空行，从而触发拒绝规则。

验证：
- 执行提交信息 Hook 并确认该无效示例不会通过校验。
EOF

cat > "$fixture_dir/english-only-body.txt" <<'EOF'
docs(architecture): 正文仍需包含中文

This body is intentionally written only in English and must be rejected.
EOF

printf '%s' 'docs(architecture): 提交信息缺少末尾换行

背景：
- 这个示例包含完整正文，但提交信息文件末尾没有保留真实换行字符。

变更：
- 通过不带换行的格式化输出创建文件，以验证末尾换行校验可以生效。

验证：
- 执行提交信息 Hook 并确认该无效示例不会通过校验。' > "$fixture_dir/missing-final-newline.txt"

expect_pass "完整中文提交信息" "$fixture_dir/valid.txt"
expect_pass "自由格式中英混合正文" "$fixture_dir/freeform-body.txt"
expect_fail "字面量 \\n" "$fixture_dir/literal-newline.txt"
expect_fail "主题不含中文" "$fixture_dir/non-chinese-subject.txt"
expect_fail "正文不含中文" "$fixture_dir/english-only-body.txt"
expect_fail "主题后缺少真实空行" "$fixture_dir/escaped-blank-line.txt"
expect_fail "文件末尾缺少真实换行" "$fixture_dir/missing-final-newline.txt"

printf 'commit-msg Hook 测试通过：%s 个场景。\n' "$pass_count"
