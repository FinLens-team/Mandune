#!/usr/bin/env bash

set -Eeuo pipefail

[[ $# -eq 2 ]] || {
  printf 'Usage: %s COMMIT_SHA OUTPUT_TAR_GZ\n' "$0" >&2
  exit 2
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
COMMIT_SHA=$1
OUTPUT=$2
[[ ${COMMIT_SHA} =~ ^[0-9a-f]{40}$ ]] || {
  printf 'ERROR: commit SHA must be 40 lowercase hexadecimal characters\n' >&2
  exit 1
}
[[ "$(git -C "${REPO_ROOT}" rev-parse HEAD)" == "${COMMIT_SHA}" ]] || {
  printf 'ERROR: COMMIT_SHA is not the checked-out commit\n' >&2
  exit 1
}

for command_name in corepack git gzip node sha256sum tar; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    printf 'ERROR: %s is required\n' "${command_name}" >&2
    exit 1
  }
done
[[ "$(node --version)" == "v22.22.1" ]] || {
  printf 'ERROR: Node 22.22.1 is required\n' >&2
  exit 1
}
[[ "$(corepack pnpm --version)" == "10.33.2" ]] || {
  printf 'ERROR: pnpm 10.33.2 is required\n' >&2
  exit 1
}

OUTPUT="$(realpath -m "${OUTPUT}")"
for archived_directory in "${REPO_ROOT}/dist" "${REPO_ROOT}/migrations"; do
  if [[ ${OUTPUT} == "${archived_directory}" || ${OUTPUT} == "${archived_directory}/"* ]]; then
    printf 'ERROR: release output cannot be written inside an archived directory\n' >&2
    exit 1
  fi
done
install -d "$(dirname -- "${OUTPUT}")"
BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/mandong-release-build.XXXXXX")"
OUTPUT_TEMP="$(mktemp "$(dirname -- "${OUTPUT}")/.mandong-release.XXXXXX")"
CHECKSUM_TEMP="$(mktemp "$(dirname -- "${OUTPUT}")/.mandong-release-sha256.XXXXXX")"
cleanup() {
  rm -rf -- "${BUILD_ROOT}"
  rm -f -- "${OUTPUT_TEMP}" "${CHECKSUM_TEMP}"
}
trap cleanup EXIT

git -C "${REPO_ROOT}" archive --format=tar "${COMMIT_SHA}" | tar -xf - -C "${BUILD_ROOT}"
corepack pnpm --dir "${BUILD_ROOT}" install --frozen-lockfile
rm -rf -- "${BUILD_ROOT}/dist"
corepack pnpm --dir "${BUILD_ROOT}" build
if find "${BUILD_ROOT}/dist/client" -name '*.map' -print -quit | grep -q .; then
  printf 'ERROR: client build contains public source maps\n' >&2
  exit 1
fi

SOURCE_DATE_EPOCH="$(git -C "${REPO_ROOT}" show -s --format=%ct "${COMMIT_SHA}")"
tar --sort=name --mtime="@${SOURCE_DATE_EPOCH}" --owner=0 --group=0 --numeric-owner \
  -C "${BUILD_ROOT}" -cf - dist migrations package.json pnpm-lock.yaml \
  | gzip -n >"${OUTPUT_TEMP}"
HASH="$(sha256sum "${OUTPUT_TEMP}" | cut -d' ' -f1)"
printf '%s  %s\n' "${HASH}" "$(basename -- "${OUTPUT}")" >"${CHECKSUM_TEMP}"
mv -f -- "${OUTPUT_TEMP}" "${OUTPUT}"
mv -f -- "${CHECKSUM_TEMP}" "${OUTPUT}.sha256"
trap - EXIT
cleanup
printf 'Release archive: %s\nSHA-256: %s\n' "${OUTPUT}" "${HASH}"
