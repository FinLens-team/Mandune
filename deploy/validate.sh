#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${DEPLOY_ROOT}/.." && pwd)"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEMP_ROOT}"' EXIT

assert_contains() {
  local file=$1
  local literal=$2
  grep -F -- "${literal}" "${file}" >/dev/null || {
    printf 'ERROR: %s is missing required setting: %s\n' "${file}" "${literal}" >&2
    exit 1
  }
}

assert_not_contains() {
  local file=$1
  local literal=$2
  if grep -F -- "${literal}" "${file}" >/dev/null; then
    printf 'ERROR: %s contains forbidden setting: %s\n' "${file}" "${literal}" >&2
    exit 1
  fi
}

assert_before() {
  local file=$1
  local first=$2
  local second=$3
  local first_line
  local second_line
  first_line="$(grep -nF -- "${first}" "${file}" | cut -d: -f1)"
  second_line="$(grep -nF -- "${second}" "${file}" | cut -d: -f1)"
  [[ -n ${first_line} && -n ${second_line} && ${first_line} -lt ${second_line} ]] || {
    printf 'ERROR: %s does not order %s before %s\n' "${file}" "${first}" "${second}" >&2
    exit 1
  }
}

while IFS= read -r script; do
  bash -n "${script}"
done < <(find "${DEPLOY_ROOT}" -type f -name '*.sh' -print | sort)
printf 'PASS: deployment shell syntax\n'

bash "${DEPLOY_ROOT}/tests/archive-validation.sh"

NGINX_TEMPLATE="${DEPLOY_ROOT}/nginx/mandong.conf.template"
for setting in \
  'access_log off;' \
  'error_log /dev/null emerg;' \
  'proxy_pass http://127.0.0.1:8787;' \
  'proxy_cache off;' \
  'proxy_request_buffering off;' \
  'proxy_read_timeout 210s;' \
  'proxy_send_timeout 210s;' \
  'package\.json$|pnpm-lock\.yaml$|migrations(?:/|$)|src(?:/|$)' \
  'location ~* \.map'; do
  assert_contains "${NGINX_TEMPLATE}" "${setting}"
done
printf 'PASS: nginx privacy, loopback, timeout, cache, and source-map invariants\n'

SYSTEMD_UNIT="${DEPLOY_ROOT}/systemd/mandong.service"
for setting in \
  'User=mandong' \
  'Environment=PATH=/opt/mandong/runtime:/usr/bin:/bin' \
  'ExecStart=/usr/bin/env node --preserve-symlinks-main /opt/mandong/current/dist/server/index.js' \
  'Environment=HOST=127.0.0.1' \
  'Environment=PORT=8787' \
  'NoNewPrivileges=yes' \
  'ProtectSystem=strict' \
  'ProtectHome=yes' \
  'CapabilityBoundingSet=' \
  'ReadWritePaths=/var/lib/mandong'; do
  assert_contains "${SYSTEMD_UNIT}" "${setting}"
done
PURGE_UNIT="${DEPLOY_ROOT}/systemd/mandong-purge.service"
for setting in \
  'ConditionPathExists=/opt/mandong/current/dist/persistence/maintenance.js' \
  'ExecStart=/usr/bin/env node --preserve-symlinks-main /opt/mandong/current/dist/persistence/maintenance.js purge-expired' \
  'User=mandong' \
  'PrivateNetwork=yes' \
  'ProtectSystem=strict' \
  'ReadWritePaths=/var/lib/mandong'; do
  assert_contains "${PURGE_UNIT}" "${setting}"
done
PURGE_TIMER="${DEPLOY_ROOT}/systemd/mandong-purge.timer"
for setting in \
  'OnCalendar=daily' \
  'Persistent=true' \
  'RandomizedDelaySec=45m' \
  'Unit=mandong-purge.service' \
  'WantedBy=timers.target'; do
  assert_contains "${PURGE_TIMER}" "${setting}"
done
assert_contains "${DEPLOY_ROOT}/scripts/lib.sh" 'readonly NODE_BIN="${RUNTIME_ROOT}/node"'
assert_contains "${DEPLOY_ROOT}/scripts/lib.sh" 'readonly COREPACK_BIN="${RUNTIME_ROOT}/corepack"'
assert_contains "${DEPLOY_ROOT}/scripts/install-host.sh" 'MANDONG_NGINX_BIN'
assert_contains "${DEPLOY_ROOT}/scripts/install-host.sh" 'MANDONG_NGINX_VHOST_PATH'
assert_contains "${DEPLOY_ROOT}/scripts/install-host.sh" 'systemctl enable --now mandong-purge.timer'
assert_contains "${REPO_ROOT}/package.json" 'node --preserve-symlinks-main dist/persistence/maintenance.js purge-expired'
printf 'PASS: systemd identity, loopback, purge scheduling, and sandbox invariants\n'

ROLLBACK_SCRIPT="${DEPLOY_ROOT}/scripts/rollback.sh"
assert_contains "${ROLLBACK_SCRIPT}" 'while preserving the live database'
assert_not_contains "${ROLLBACK_SCRIPT}" 'PRE_MIGRATION_BACKUP'
assert_not_contains "${ROLLBACK_SCRIPT}" 'PREVIOUS_DB_PRESENT'
assert_contains "${ROLLBACK_SCRIPT}" 'restore_database "${GUARD_PRESENT}" "${GUARD_BACKUP}"'
printf 'PASS: rollback preserves live data and reserves guard restore for recovery\n'

CREATE_RELEASE_SCRIPT="${DEPLOY_ROOT}/scripts/create-release.sh"
assert_contains "${CREATE_RELEASE_SCRIPT}" 'rm -rf -- "${REPO_ROOT}/dist"'
assert_before "${CREATE_RELEASE_SCRIPT}" 'rm -rf -- "${REPO_ROOT}/dist"' 'corepack pnpm --dir "${REPO_ROOT}" build'
printf 'PASS: release build removes all stale dist output before build\n'

assert_contains "${REPO_ROOT}/vite.config.ts" 'sourcemap: false'
printf 'PASS: production client source maps are disabled\n'

if command -v systemd-analyze >/dev/null 2>&1; then
  systemd-analyze verify "${SYSTEMD_UNIT}" "${PURGE_UNIT}" "${PURGE_TIMER}"
  printf 'PASS: systemd-analyze verify\n'
else
  printf 'NOT RUN: systemd-analyze verify (systemd-analyze unavailable)\n'
fi

missing_nginx_tools=()
for command_name in envsubst nginx openssl; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    missing_nginx_tools+=("${command_name}")
  fi
done
if [[ ${#missing_nginx_tools[@]} -eq 0 ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
    -subj '/CN=mandong.invalid' \
    -keyout "${TEMP_ROOT}/tls.key" -out "${TEMP_ROOT}/tls.crt" >/dev/null 2>&1
  export MANDONG_SERVER_NAME=mandong.invalid
  export MANDONG_TLS_CERTIFICATE="${TEMP_ROOT}/tls.crt"
  export MANDONG_TLS_CERTIFICATE_KEY="${TEMP_ROOT}/tls.key"
  "${DEPLOY_ROOT}/scripts/render-nginx.sh" "${TEMP_ROOT}/mandong.conf"
  {
    printf 'events {}\nhttp {\n'
    printf '  include %s;\n' "${TEMP_ROOT}/mandong.conf"
    printf '}\n'
  } >"${TEMP_ROOT}/nginx.conf"
  nginx -t -p "${TEMP_ROOT}" -c "${TEMP_ROOT}/nginx.conf"
  printf 'PASS: rendered nginx -t\n'
else
  printf 'NOT RUN: rendered nginx -t (missing tools: %s)\n' "${missing_nginx_tools[*]}"
fi
