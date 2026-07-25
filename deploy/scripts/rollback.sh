#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

[[ $# -eq 0 ]] || {
  printf 'Usage: %s\n' "$0" >&2
  exit 2
}

require_root
for command_name in curl sqlite3 systemctl; do
  require_command "${command_name}"
done
acquire_deploy_lock

CURRENT="$(current_release)"
[[ -n ${CURRENT} ]] || die "there is no active release to roll back"
CURRENT_SHA="${CURRENT##*/}"
validate_commit_sha "${CURRENT_SHA}"
METADATA="${METADATA_ROOT}/${CURRENT_SHA}.meta"
[[ -f ${METADATA} ]] || die "rollback metadata is absent for the active release"
[[ "$(metadata_value "${METADATA}" RELEASE_SHA)" == "${CURRENT_SHA}" ]] || die "rollback metadata does not match the active release"

TARGET="$(metadata_value "${METADATA}" PREVIOUS_RELEASE)"
[[ -n ${TARGET} && ${TARGET} == "${RELEASE_ROOT}/"* && -d ${TARGET} ]] || die "rollback target is absent or invalid"
TARGET_SHA="${TARGET##*/}"
validate_commit_sha "${TARGET_SHA}"

stop_service
GUARD_PRESENT=0
GUARD_BACKUP=""
if [[ -f ${DB_PATH} ]]; then
  GUARD_PRESENT=1
  GUARD_BACKUP="${BACKUP_ROOT}/rollback-guard-${CURRENT_SHA}-$(date -u +%Y%m%dT%H%M%SZ).sqlite3"
  if ! backup_database "${GUARD_BACKUP}"; then
    if ! start_and_verify "${CURRENT_SHA}"; then
      systemctl stop "${SERVICE_NAME}" || true
      die "rollback guard backup failed and current release health recovery failed"
    fi
    die "rollback guard backup failed; current release remains active"
  fi
fi

if ! activate_release "${TARGET}" "${TARGET_SHA}"; then
  if ! restore_database "${GUARD_PRESENT}" "${GUARD_BACKUP}"; then
    systemctl stop "${SERVICE_NAME}" || true
    die "rollback target activation failed and guard database restoration failed"
  fi
  activate_release "${CURRENT}" "${CURRENT_SHA}" \
    || die "rollback target activation failed; guard database was restored but current symlink restoration failed"
  if ! start_and_verify "${CURRENT_SHA}"; then
    systemctl stop "${SERVICE_NAME}" || true
    die "rollback target activation failed and current release health recovery failed"
  fi
  die "rollback target activation failed; current release and database were restored"
fi
if start_and_verify "${TARGET_SHA}"; then
  printf 'Rolled back from %s to %s while preserving the live database.\n' "${CURRENT_SHA}" "${TARGET_SHA}"
  exit 0
fi

systemctl stop "${SERVICE_NAME}" || true
if ! restore_database "${GUARD_PRESENT}" "${GUARD_BACKUP}"; then
  die "rollback target failed health verification and guard database restoration failed"
fi
activate_release "${CURRENT}" "${CURRENT_SHA}" \
  || die "rollback target failed health verification; guard database was restored but original symlink restoration failed"
if ! start_and_verify "${CURRENT_SHA}"; then
  systemctl stop "${SERVICE_NAME}" || true
  die "rollback target failed health verification; original release and database were restored but original health verification failed"
fi
die "rollback target failed health verification; original release and database were restored"
