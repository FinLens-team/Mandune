#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../scripts/rollback.sh
source "${DEPLOY_ROOT}/scripts/rollback.sh"

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/mandong-rollback-test.XXXXXX")"
trap 'rm -rf "${TEMP_ROOT}"' EXIT

readonly TEST_CURRENT_SHA="1111111111111111111111111111111111111111"
readonly TEST_TARGET_SHA="2222222222222222222222222222222222222222"
readonly TEST_CURRENT_RELEASE="${TEMP_ROOT}/releases/${TEST_CURRENT_SHA}"
readonly TEST_TARGET_RELEASE="${TEMP_ROOT}/releases/${TEST_TARGET_SHA}"
readonly TEST_METADATA="${TEMP_ROOT}/${TEST_CURRENT_SHA}.meta"
readonly TEST_DATABASE="${TEMP_ROOT}/live.sqlite3"
readonly TEST_GUARD="${TEMP_ROOT}/guard.sqlite3"
readonly TEST_ACTIVE_RELEASE="${TEMP_ROOT}/active-release"
readonly TEST_SERVICE_STATE="${TEMP_ROOT}/service-state"

fail() {
  printf 'ERROR: rollback recovery fault test failed: %s\n' "$*" >&2
  exit 1
}

database_value() {
  sqlite3 -batch "${TEST_DATABASE}" 'SELECT value FROM state WHERE key = "marker";'
}

reset_scenario() {
  rm -rf "${TEMP_ROOT}/releases"
  install -d "${TEST_CURRENT_RELEASE}" "${TEST_TARGET_RELEASE}"
  install -m 0600 /dev/null "${TEST_METADATA}"
  rm -f "${TEST_DATABASE}" "${TEST_GUARD}"
  sqlite3 -batch "${TEST_DATABASE}" \
    'CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO state VALUES ("marker", "current");'
  printf '%s\n' "${TEST_CURRENT_RELEASE}" >"${TEST_ACTIVE_RELEASE}"
  printf 'running:%s\n' "${TEST_CURRENT_SHA}" >"${TEST_SERVICE_STATE}"
}

require_root() { :; }
require_command() { :; }
acquire_deploy_lock() { :; }
current_release() { printf '%s\n' "${TEST_CURRENT_RELEASE}"; }
rollback_metadata_path() { printf '%s\n' "${TEST_METADATA}"; }
rollback_target_is_valid() { [[ $1 == "${TEST_TARGET_RELEASE}" ]]; }
rollback_database_is_present() { [[ -f ${TEST_DATABASE} ]]; }
rollback_guard_path() { printf '%s\n' "${TEST_GUARD}"; }
metadata_value() {
  case $2 in
    RELEASE_SHA) printf '%s\n' "${TEST_CURRENT_SHA}" ;;
    PREVIOUS_RELEASE) printf '%s\n' "${TEST_TARGET_RELEASE}" ;;
    *) return 1 ;;
  esac
}
stop_service() { printf 'stopped\n' >"${TEST_SERVICE_STATE}"; }
backup_database() {
  sqlite3 -batch "${TEST_DATABASE}" ".backup '$1'"
}
restore_database() {
  if [[ ${SCENARIO} == "guard-restore-failure" ]]; then
    return 1
  fi
  rm -f "${TEST_DATABASE}"
  sqlite3 -batch "$2" ".backup '${TEST_DATABASE}'"
}
activate_release() {
  local release=$1
  if [[ ${release} == "${TEST_TARGET_RELEASE}" && ${SCENARIO} == "activation-failure" ]]; then
    sqlite3 -batch "${TEST_DATABASE}" 'UPDATE state SET value = "target-mutation" WHERE key = "marker";'
    printf '%s\n' "${TEST_TARGET_RELEASE}" >"${TEST_ACTIVE_RELEASE}"
    return 1
  fi
  printf '%s\n' "${release}" >"${TEST_ACTIVE_RELEASE}"
}
start_and_verify() {
  local sha=$1
  if [[ ${sha} == "${TEST_TARGET_SHA}" ]]; then
    sqlite3 -batch "${TEST_DATABASE}" 'UPDATE state SET value = "target-mutation" WHERE key = "marker";'
    case ${SCENARIO} in
      start-failure)
        printf 'stopped\n' >"${TEST_SERVICE_STATE}"
        return 1
        ;;
      health-failure|current-recovery-failure|guard-restore-failure)
        printf 'running:%s\n' "${TEST_TARGET_SHA}" >"${TEST_SERVICE_STATE}"
        return 1
        ;;
    esac
  fi
  if [[ ${sha} == "${TEST_CURRENT_SHA}" && ${SCENARIO} == "current-recovery-failure" ]]; then
    printf 'stopped\n' >"${TEST_SERVICE_STATE}"
    return 1
  fi
  printf 'running:%s\n' "${sha}" >"${TEST_SERVICE_STATE}"
}
systemctl() {
  [[ $1 == "stop" && $2 == "${SERVICE_NAME}" ]] || return 1
  printf 'stopped\n' >"${TEST_SERVICE_STATE}"
}

expect_recovered_failure() {
  local scenario=$1
  local output="${TEMP_ROOT}/${scenario}.log"
  reset_scenario
  SCENARIO=${scenario}
  export SCENARIO
  if (rollback_main) >"${output}" 2>&1; then
    fail "${scenario} unexpectedly reported a successful rollback"
  fi
  [[ "$(database_value)" == "current" ]] || fail "${scenario} did not restore the guard database"
  [[ "$(<"${TEST_ACTIVE_RELEASE}")" == "${TEST_CURRENT_RELEASE}" ]] \
    || fail "${scenario} did not reactivate the current release"
  [[ "$(<"${TEST_SERVICE_STATE}")" == "running:${TEST_CURRENT_SHA}" ]] \
    || fail "${scenario} did not recover current-release health"
}

for scenario in activation-failure start-failure health-failure; do
  expect_recovered_failure "${scenario}"
done

reset_scenario
SCENARIO=current-recovery-failure
export SCENARIO
if (rollback_main) >"${TEMP_ROOT}/${SCENARIO}.log" 2>&1; then
  fail "current recovery failure unexpectedly succeeded"
fi
[[ "$(database_value)" == "current" ]] || fail "current recovery failure lost guard restoration"
[[ "$(<"${TEST_ACTIVE_RELEASE}")" == "${TEST_CURRENT_RELEASE}" ]] \
  || fail "current recovery failure did not restore the current release"
[[ "$(<"${TEST_SERVICE_STATE}")" == "stopped" ]] \
  || fail "current recovery failure did not leave the service stopped"

reset_scenario
SCENARIO=guard-restore-failure
export SCENARIO
if (rollback_main) >"${TEMP_ROOT}/${SCENARIO}.log" 2>&1; then
  fail "guard restoration failure unexpectedly succeeded"
fi
[[ "$(database_value)" == "target-mutation" ]] \
  || fail "guard restoration failure fixture did not retain the target mutation"
[[ "$(<"${TEST_SERVICE_STATE}")" == "stopped" ]] \
  || fail "guard restoration failure did not leave the service stopped"

printf 'PASS: rollback activation/start/health faults restore current release and guard DB or fail closed\n'
