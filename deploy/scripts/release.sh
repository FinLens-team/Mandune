#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

[[ $# -eq 3 ]] || {
  printf 'Usage: %s RELEASE_TAR_GZ COMMIT_SHA EXPECTED_SHA256\n' "$0" >&2
  exit 2
}

require_root
for command_name in curl sha256sum sqlite3 systemctl tar; do
  require_command "${command_name}"
done
[[ -x ${NODE_BIN} ]] || die "validated Node runtime is unavailable: ${NODE_BIN}"
[[ -x ${COREPACK_BIN} ]] || die "validated Corepack runtime is unavailable: ${COREPACK_BIN}"
[[ "$(PATH="${RUNTIME_ROOT}:/usr/bin:/bin" "${COREPACK_BIN}" pnpm --version)" == "10.33.2" ]] \
  || die "pnpm 10.33.2 is required"
acquire_deploy_lock

ARCHIVE="$(realpath "$1")"
SHA=$2
EXPECTED_HASH=$3
validate_commit_sha "${SHA}"
[[ ${EXPECTED_HASH} =~ ^[0-9a-f]{64}$ ]] || die "expected SHA-256 must be 64 lowercase hexadecimal characters"
[[ "$(sha256sum "${ARCHIVE}" | cut -d' ' -f1)" == "${EXPECTED_HASH}" ]] || die "release archive checksum mismatch"

PREVIOUS="$(current_release)"
PREVIOUS_SHA=""
if [[ -n ${PREVIOUS} ]]; then
  PREVIOUS_SHA="${PREVIOUS##*/}"
  validate_commit_sha "${PREVIOUS_SHA}"
fi

RELEASE="${RELEASE_ROOT}/${SHA}"
[[ ! -e ${RELEASE} ]] || die "release already exists: ${SHA}"
install -d -o root -g root -m 0755 "${RELEASE_ROOT}"
install -d -o root -g root -m 0700 "${BACKUP_ROOT}" "${METADATA_ROOT}"

while IFS= read -r member; do
  [[ -n ${member} ]] || continue
  [[ ${member} != /* && ${member} != ".." && ${member} != ../* && ${member} != */../* && ${member} != */.. ]] \
    || die "release archive contains an unsafe path"
done < <(tar -tzf "${ARCHIVE}")

INCOMING="$(mktemp -d "${RELEASE_ROOT}/.incoming.${SHA}.XXXXXX")"
trap 'rm -rf "${INCOMING}"' EXIT
tar --no-same-owner --no-same-permissions -xzf "${ARCHIVE}" -C "${INCOMING}"
for required_path in dist/server/index.js dist/client/index.html migrations package.json pnpm-lock.yaml; do
  [[ -e ${INCOMING}/${required_path} ]] || die "release archive is missing ${required_path}"
done
if find "${INCOMING}/dist/client" -type f -name '*.map' -print -quit | grep -q .; then
  die "release archive contains public client source maps"
fi
PATH="${RUNTIME_ROOT}:/usr/bin:/bin" "${COREPACK_BIN}" pnpm --dir "${INCOMING}" \
  install --prod --frozen-lockfile --ignore-scripts
chown -R root:"${SERVICE_USER}" "${INCOMING}"
chmod -R go-rwx "${INCOMING}"
chmod -R g+rX "${INCOMING}"
mv "${INCOMING}" "${RELEASE}"
trap - EXIT

stop_service
DB_PRESENT=0
BACKUP=""
if [[ -f ${DB_PATH} ]]; then
  DB_PRESENT=1
  BACKUP="${BACKUP_ROOT}/db-before-${SHA}.sqlite3"
  if ! backup_database "${BACKUP}"; then
    if [[ -n ${PREVIOUS_SHA} ]] && ! start_and_verify "${PREVIOUS_SHA}"; then
      systemctl stop "${SERVICE_NAME}" || true
      die "database backup failed and the previous release could not be recovered"
    fi
    die "database backup failed; candidate was not activated"
  fi
fi
if ! write_release_metadata "${SHA}" "${PREVIOUS}" "${DB_PRESENT}" "${BACKUP}"; then
  if [[ -n ${PREVIOUS_SHA} ]] && ! start_and_verify "${PREVIOUS_SHA}"; then
    systemctl stop "${SERVICE_NAME}" || true
    die "release metadata write failed and previous release health recovery failed"
  fi
  die "release metadata write failed; candidate was not activated"
fi

if ! activate_release "${RELEASE}" "${SHA}"; then
  if [[ -n ${PREVIOUS} ]]; then
    activate_release "${PREVIOUS}" "${PREVIOUS_SHA}" || die "candidate activation failed and previous symlink restoration failed"
    if ! start_and_verify "${PREVIOUS_SHA}"; then
      systemctl stop "${SERVICE_NAME}" || true
      die "candidate activation failed and previous release health recovery failed"
    fi
  else
    deactivate_all_releases
  fi
  die "candidate activation failed before startup; previous release was restored"
fi
if start_and_verify "${SHA}"; then
  printf 'Release %s is active and passed the exact-version health check.\n' "${SHA}"
  exit 0
fi

systemctl stop "${SERVICE_NAME}" || true
if [[ -n ${PREVIOUS} ]]; then
  activate_release "${PREVIOUS}" "${PREVIOUS_SHA}" || die "candidate health check failed and previous symlink restoration failed"
  if ! restore_database "${DB_PRESENT}" "${BACKUP}"; then
    die "candidate health check failed; previous symlink was restored but database restoration failed"
  fi
  if ! start_and_verify "${PREVIOUS_SHA}"; then
    systemctl stop "${SERVICE_NAME}" || true
    die "candidate health check failed; previous release and database were restored but previous health verification failed"
  fi
else
  deactivate_all_releases
  if ! restore_database "${DB_PRESENT}" "${BACKUP}"; then
    die "candidate health check failed; candidate was deactivated but database restoration failed"
  fi
fi
die "candidate health check failed; previous release and migration snapshot were restored"
