#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/../nginx/mandong.conf.template"

[[ $# -eq 1 ]] || {
  printf 'Usage: %s OUTPUT\n' "$0" >&2
  exit 2
}

for name in MANDONG_SERVER_NAME MANDONG_TLS_CERTIFICATE MANDONG_TLS_CERTIFICATE_KEY; do
  [[ -n ${!name:-} ]] || {
    printf 'ERROR: required variable is unset: %s\n' "${name}" >&2
    exit 1
  }
done

[[ ${MANDONG_SERVER_NAME} =~ ^[A-Za-z0-9.-]+$ ]] || {
  printf 'ERROR: invalid MANDONG_SERVER_NAME\n' >&2
  exit 1
}
[[ ${MANDONG_TLS_CERTIFICATE} =~ ^/[A-Za-z0-9_./+-]+$ ]] || {
  printf 'ERROR: invalid MANDONG_TLS_CERTIFICATE path\n' >&2
  exit 1
}
[[ ${MANDONG_TLS_CERTIFICATE_KEY} =~ ^/[A-Za-z0-9_./+-]+$ ]] || {
  printf 'ERROR: invalid MANDONG_TLS_CERTIFICATE_KEY path\n' >&2
  exit 1
}
command -v envsubst >/dev/null 2>&1 || {
  printf 'ERROR: envsubst is required\n' >&2
  exit 1
}

OUTPUT=$1
OUTPUT_DIR="$(dirname -- "${OUTPUT}")"
[[ -d ${OUTPUT_DIR} ]] || {
  printf 'ERROR: output directory does not exist\n' >&2
  exit 1
}

umask 077
TEMPORARY="$(mktemp "${OUTPUT_DIR}/.mandong-nginx.XXXXXX")"
trap 'rm -f "${TEMPORARY}"' EXIT
envsubst '${MANDONG_SERVER_NAME} ${MANDONG_TLS_CERTIFICATE} ${MANDONG_TLS_CERTIFICATE_KEY}' \
  <"${TEMPLATE}" >"${TEMPORARY}"
chmod 0644 "${TEMPORARY}"
mv -f "${TEMPORARY}" "${OUTPUT}"
trap - EXIT
