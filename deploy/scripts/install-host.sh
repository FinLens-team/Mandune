#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

require_root
for command_name in envsubst getent groupadd install systemctl systemd-analyze useradd; do
  require_command "${command_name}"
done

SOURCE_NODE_INPUT="${MANDONG_NODE_BIN:-$(command -v node || true)}"
SOURCE_COREPACK_INPUT="${MANDONG_COREPACK_BIN:-$(command -v corepack || true)}"
NGINX_BIN_INPUT="${MANDONG_NGINX_BIN:-$(command -v nginx || true)}"
NGINX_TARGET="${MANDONG_NGINX_VHOST_PATH:-/etc/nginx/conf.d/mandong.conf}"
[[ -n ${SOURCE_NODE_INPUT} ]] || die "MANDONG_NODE_BIN is required when Node is not on PATH"
[[ -n ${SOURCE_COREPACK_INPUT} ]] || die "MANDONG_COREPACK_BIN is required when Corepack is not on PATH"
[[ -n ${NGINX_BIN_INPUT} ]] || die "MANDONG_NGINX_BIN is required when Nginx is not on PATH"
SOURCE_NODE="$(realpath "${SOURCE_NODE_INPUT}")"
SOURCE_COREPACK="$(realpath "${SOURCE_COREPACK_INPUT}")"
NGINX_BIN="$(realpath "${NGINX_BIN_INPUT}")"
[[ -x ${SOURCE_NODE} ]] || die "MANDONG_NODE_BIN must name an executable Node binary"
[[ -x ${SOURCE_COREPACK} ]] || die "MANDONG_COREPACK_BIN must name an executable Corepack entrypoint"
[[ -x ${NGINX_BIN} ]] || die "MANDONG_NGINX_BIN must name an executable Nginx binary"
[[ ${NGINX_TARGET} == /* && -d $(dirname -- "${NGINX_TARGET}") ]] \
  || die "MANDONG_NGINX_VHOST_PATH must be an absolute path in an existing directory"
[[ "$("${SOURCE_NODE}" --version)" == "v22.22.1" ]] || die "Node 22.22.1 is required"
SOURCE_NODE_DIR="$(dirname -- "${SOURCE_NODE}")"
[[ "$(PATH="${SOURCE_NODE_DIR}:/usr/bin:/bin" "${SOURCE_COREPACK}" pnpm --version)" == "10.33.2" ]] \
  || die "pnpm 10.33.2 is required"
[[ -f ${MANDONG_TLS_CERTIFICATE:-} ]] || die "MANDONG_TLS_CERTIFICATE must name an existing file"
[[ -f ${MANDONG_TLS_CERTIFICATE_KEY:-} ]] || die "MANDONG_TLS_CERTIFICATE_KEY must name an existing file"

if ! getent group "${SERVICE_USER}" >/dev/null; then
  groupadd --system "${SERVICE_USER}"
fi
if ! getent passwd "${SERVICE_USER}" >/dev/null; then
  useradd --system --gid "${SERVICE_USER}" --home-dir "${STATE_ROOT}" --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

install -d -o root -g root -m 0755 /opt/mandong "${RELEASE_ROOT}" "${RUNTIME_ROOT}"
ln -sfn "${SOURCE_NODE}" "${NODE_BIN}.next"
mv -Tf "${NODE_BIN}.next" "${NODE_BIN}"
ln -sfn "${SOURCE_COREPACK}" "${COREPACK_BIN}.next"
mv -Tf "${COREPACK_BIN}.next" "${COREPACK_BIN}"
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 0700 "${STATE_ROOT}"
install -d -o root -g root -m 0700 "${BACKUP_ROOT}" "${METADATA_ROOT}" /etc/mandong
if [[ ! -e /etc/mandong/mandong.env ]]; then
  install -o root -g root -m 0600 /dev/null /etc/mandong/mandong.env
fi
chown root:root /etc/mandong/mandong.env
chmod 0600 /etc/mandong/mandong.env

systemd-analyze verify "${SCRIPT_DIR}/../systemd/mandong.service"
install -o root -g root -m 0644 "${SCRIPT_DIR}/../systemd/mandong.service" /etc/systemd/system/mandong.service
systemctl daemon-reload
systemctl enable mandong.service

NGINX_TARGET_DIR="$(dirname -- "${NGINX_TARGET}")"
NGINX_CANDIDATE="$(mktemp "${NGINX_TARGET_DIR}/.mandong.conf.XXXXXX")"
NGINX_BACKUP="$(mktemp "${NGINX_TARGET_DIR}/.mandong.previous.XXXXXX")"
rm -f "${NGINX_BACKUP}"
trap 'rm -f "${NGINX_CANDIDATE}" "${NGINX_BACKUP}"' EXIT
"${SCRIPT_DIR}/render-nginx.sh" "${NGINX_CANDIDATE}"
if [[ -f ${NGINX_TARGET} ]]; then
  cp -a "${NGINX_TARGET}" "${NGINX_BACKUP}"
fi
install -o root -g root -m 0644 "${NGINX_CANDIDATE}" "${NGINX_TARGET}"
if ! "${NGINX_BIN}" -t; then
  if [[ -f ${NGINX_BACKUP} ]]; then
    mv -f "${NGINX_BACKUP}" "${NGINX_TARGET}"
  else
    rm -f "${NGINX_TARGET}"
  fi
  die "nginx validation failed; previous config restored"
fi
if systemctl is-active --quiet nginx.service; then
  if ! systemctl reload nginx.service; then
    if [[ -f ${NGINX_BACKUP} ]]; then
      mv -f "${NGINX_BACKUP}" "${NGINX_TARGET}"
    else
      rm -f "${NGINX_TARGET}"
    fi
    "${NGINX_BIN}" -t || die "nginx reload failed and previous config is invalid"
    systemctl reload nginx.service || die "nginx reload failed and previous config could not be restored"
    die "nginx reload failed; previous config restored"
  fi
fi

rm -f "${NGINX_CANDIDATE}" "${NGINX_BACKUP}"
trap - EXIT
printf 'Host configuration installed and validated; no Mandong release was started.\n'
