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

while IFS= read -r script; do
  bash -n "${script}"
done < <(find "${DEPLOY_ROOT}" -type f -name '*.sh' -print | sort)
printf 'PASS: deployment shell syntax\n'

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
assert_contains "${DEPLOY_ROOT}/scripts/lib.sh" 'readonly NODE_BIN="${RUNTIME_ROOT}/node"'
assert_contains "${DEPLOY_ROOT}/scripts/lib.sh" 'readonly COREPACK_BIN="${RUNTIME_ROOT}/corepack"'
assert_contains "${DEPLOY_ROOT}/scripts/install-host.sh" 'MANDONG_NGINX_BIN'
assert_contains "${DEPLOY_ROOT}/scripts/install-host.sh" 'MANDONG_NGINX_VHOST_PATH'
printf 'PASS: systemd identity, loopback, and sandbox invariants\n'

assert_contains "${REPO_ROOT}/vite.config.ts" 'sourcemap: false'
printf 'PASS: production client source maps are disabled\n'

if command -v systemd-analyze >/dev/null 2>&1; then
  systemd-analyze verify "${SYSTEMD_UNIT}"
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
