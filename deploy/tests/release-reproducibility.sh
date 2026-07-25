#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd -- "${DEPLOY_ROOT}/.." && pwd)"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/mandong-repro-test.XXXXXX")"
PUBLIC_DIRECTORY="${REPO_ROOT}/public"
UNTRACKED_INPUT="${PUBLIC_DIRECTORY}/.mandong-release-repro-$$.txt"
CREATED_PUBLIC=0

cleanup() {
  rm -f -- "${UNTRACKED_INPUT}"
  if [[ ${CREATED_PUBLIC} -eq 1 ]]; then
    rmdir -- "${PUBLIC_DIRECTORY}" 2>/dev/null || true
  fi
  rm -rf -- "${TEMP_ROOT}"
}
trap cleanup EXIT

fail() {
  printf 'ERROR: release reproducibility test failed: %s\n' "$*" >&2
  exit 1
}

NODE_COMMAND="$(command -v node || true)"
if [[ -n ${NODE_COMMAND} ]]; then
  NODE_RUNTIME_DIRECTORY="$(dirname -- "$(realpath "${NODE_COMMAND}")")"
  if [[ -x ${NODE_RUNTIME_DIRECTORY}/corepack ]]; then
    PATH="${NODE_RUNTIME_DIRECTORY}:${PATH}"
    export PATH
  fi
fi

[[ ! -e ${UNTRACKED_INPUT} ]] || fail "test input path already exists"
if [[ ! -d ${PUBLIC_DIRECTORY} ]]; then
  install -d "${PUBLIC_DIRECTORY}"
  CREATED_PUBLIC=1
fi

SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
FIRST="${TEMP_ROOT}/first.tar.gz"
SECOND="${TEMP_ROOT}/second.tar.gz"

printf 'untracked build input: first\n' >"${UNTRACKED_INPUT}"
"${DEPLOY_ROOT}/scripts/create-release.sh" "${SHA}" "${FIRST}"
printf 'untracked build input: second and different\n' >"${UNTRACKED_INPUT}"
"${DEPLOY_ROOT}/scripts/create-release.sh" "${SHA}" "${SECOND}"

cmp --silent "${FIRST}" "${SECOND}" || fail "same commit produced different archive bytes"
if tar -tzf "${FIRST}" | grep -F '.mandong-release-repro-' >/dev/null; then
  fail "untracked Vite public input entered the release archive"
fi
FIRST_HASH="$(sha256sum "${FIRST}" | cut -d' ' -f1)"
SECOND_HASH="$(sha256sum "${SECOND}" | cut -d' ' -f1)"
[[ ${FIRST_HASH} == "${SECOND_HASH}" ]] || fail "same commit produced different digests"

printf 'PASS: same-commit archives are byte-identical and ignore untracked build inputs (%s)\n' "${FIRST_HASH}"
