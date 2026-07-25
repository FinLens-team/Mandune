#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../scripts/lib.sh
source "${DEPLOY_ROOT}/scripts/lib.sh"

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/mandong-lock-test.XXXXXX")"
trap 'rm -rf "${TEMP_ROOT}"' EXIT

fail() {
  printf 'ERROR: shared maintenance lock test failed: %s\n' "$*" >&2
  exit 1
}

LOCK_FILE="${TEMP_ROOT}/maintenance.lock"
install -m 0660 /dev/null "${LOCK_FILE}"
OWNER="$(stat -c '%U' "${LOCK_FILE}")"
GROUP="$(stat -c '%G' "${LOCK_FILE}")"
validate_lock_file "${LOCK_FILE}" "${OWNER}" "${GROUP}" 660 \
  || fail "valid lock metadata was rejected"

chmod 0640 "${LOCK_FILE}"
if validate_lock_file "${LOCK_FILE}" "${OWNER}" "${GROUP}" 660; then
  fail "incorrect lock mode was accepted"
fi
chmod 0660 "${LOCK_FILE}"

ln -s "${LOCK_FILE}" "${TEMP_ROOT}/lock-link"
if validate_lock_file "${TEMP_ROOT}/lock-link" "${OWNER}" "${GROUP}" 660; then
  fail "symlink lock was accepted"
fi

exec 8<>"${LOCK_FILE}"
flock --exclusive 8
set +e
(
  acquire_lock_file "${LOCK_FILE}" 1
)
LOCK_STATUS=$?
set -e
[[ ${LOCK_STATUS} -eq 75 ]] || fail "contender did not time out with status 75"
flock --unlock 8
exec 8>&-

(
  acquire_lock_file "${LOCK_FILE}" 1
) || fail "lock remained unavailable after its holder exited"

printf 'PASS: release, rollback, and purge lock primitive is mutually exclusive with bounded wait\n'
