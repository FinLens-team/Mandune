#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

rollback_metadata_path() {
  printf '%s/%s.meta\n' "${METADATA_ROOT}" "$1"
}

rollback_target_is_valid() {
  [[ -n $1 && $1 == "${RELEASE_ROOT}/"* && -d $1 ]]
}

rollback_database_is_present() {
  [[ -f ${DB_PATH} ]]
}

rollback_guard_path() {
  printf '%s/rollback-guard-%s-%s.sqlite3\n' \
    "${BACKUP_ROOT}" "$1" "$(date -u +%Y%m%dT%H%M%SZ)"
}

rollback_main() {
  [[ $# -eq 0 ]] || {
    printf 'Usage: %s\n' "$0" >&2
    return 2
  }

  require_root
  for command_name in curl sqlite3 systemctl; do
    require_command "${command_name}"
  done
  acquire_deploy_lock

  local current
  local current_sha
  local metadata
  local target
  local target_sha
  local guard_present=0
  local guard_backup=""

  current="$(current_release)"
  [[ -n ${current} ]] || die "there is no active release to roll back"
  current_sha="${current##*/}"
  validate_commit_sha "${current_sha}"
  metadata="$(rollback_metadata_path "${current_sha}")"
  [[ -f ${metadata} ]] || die "rollback metadata is absent for the active release"
  [[ "$(metadata_value "${metadata}" RELEASE_SHA)" == "${current_sha}" ]] \
    || die "rollback metadata does not match the active release"

  target="$(metadata_value "${metadata}" PREVIOUS_RELEASE)"
  rollback_target_is_valid "${target}" || die "rollback target is absent or invalid"
  target_sha="${target##*/}"
  validate_commit_sha "${target_sha}"

  stop_service
  if rollback_database_is_present; then
    guard_present=1
    guard_backup="$(rollback_guard_path "${current_sha}")"
    if ! backup_database "${guard_backup}"; then
      if ! start_and_verify "${current_sha}"; then
        systemctl stop "${SERVICE_NAME}" || true
        die "rollback guard backup failed and current release health recovery failed"
      fi
      die "rollback guard backup failed; current release remains active"
    fi
  fi

  if ! activate_release "${target}" "${target_sha}"; then
    if ! restore_database "${guard_present}" "${guard_backup}"; then
      systemctl stop "${SERVICE_NAME}" || true
      die "rollback target activation failed and guard database restoration failed"
    fi
    activate_release "${current}" "${current_sha}" \
      || die "rollback target activation failed; guard database was restored but current symlink restoration failed"
    if ! start_and_verify "${current_sha}"; then
      systemctl stop "${SERVICE_NAME}" || true
      die "rollback target activation failed and current release health recovery failed"
    fi
    die "rollback target activation failed; current release and database were restored"
  fi
  if start_and_verify "${target_sha}"; then
    printf 'Rolled back from %s to %s while preserving the live database.\n' "${current_sha}" "${target_sha}"
    return 0
  fi

  systemctl stop "${SERVICE_NAME}" || true
  if ! restore_database "${guard_present}" "${guard_backup}"; then
    die "rollback target failed health verification and guard database restoration failed"
  fi
  activate_release "${current}" "${current_sha}" \
    || die "rollback target failed health verification; guard database was restored but original symlink restoration failed"
  if ! start_and_verify "${current_sha}"; then
    systemctl stop "${SERVICE_NAME}" || true
    die "rollback target failed health verification; original release and database were restored but original health verification failed"
  fi
  die "rollback target failed health verification; original release and database were restored"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  rollback_main "$@"
fi
