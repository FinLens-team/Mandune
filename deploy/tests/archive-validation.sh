#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../scripts/lib.sh
source "${DEPLOY_ROOT}/scripts/lib.sh"

TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEMP_ROOT}"' EXIT

fail() {
  printf 'ERROR: archive validation fault test failed: %s\n' "$*" >&2
  exit 1
}

make_tree() {
  local root=$1
  install -d "${root}/dist/server" "${root}/dist/client" "${root}/migrations"
  install -m 0644 /dev/null "${root}/dist/server/index.js"
  install -m 0644 /dev/null "${root}/dist/client/index.html"
  install -m 0644 /dev/null "${root}/migrations/001-initial.sql"
  install -m 0644 /dev/null "${root}/package.json"
  install -m 0644 /dev/null "${root}/pnpm-lock.yaml"
}

archive_tree() {
  local root=$1
  local archive=$2
  tar -C "${root}" -czf "${archive}" dist migrations package.json pnpm-lock.yaml
}

expect_accept() {
  local archive=$1
  validate_release_archive "${archive}" >/dev/null 2>&1 || fail "valid archive was rejected"
}

expect_reject() {
  local archive=$1
  local label=$2
  if validate_release_archive "${archive}" >/dev/null 2>&1; then
    fail "${label} archive was accepted"
  fi
}

BASE="${TEMP_ROOT}/base"
make_tree "${BASE}"
archive_tree "${BASE}" "${TEMP_ROOT}/valid.tar.gz"
expect_accept "${TEMP_ROOT}/valid.tar.gz"

UNICODE="${TEMP_ROOT}/unicode"
cp -a "${BASE}" "${UNICODE}"
install -m 0644 /dev/null "${UNICODE}/dist/server/持仓分析-skill.md"
archive_tree "${UNICODE}" "${TEMP_ROOT}/unicode.tar.gz"
expect_accept "${TEMP_ROOT}/unicode.tar.gz"
validate_release_tree "${UNICODE}" >/dev/null 2>&1 || fail "UTF-8 extracted tree was rejected"

SYMLINK="${TEMP_ROOT}/symlink"
cp -a "${BASE}" "${SYMLINK}"
ln -s ../../package.json "${SYMLINK}/dist/client/leak"
archive_tree "${SYMLINK}" "${TEMP_ROOT}/symlink.tar.gz"
expect_reject "${TEMP_ROOT}/symlink.tar.gz" "symlink"

HARDLINK="${TEMP_ROOT}/hardlink"
cp -a "${BASE}" "${HARDLINK}"
ln "${HARDLINK}/package.json" "${HARDLINK}/dist/server/duplicate.js"
archive_tree "${HARDLINK}" "${TEMP_ROOT}/hardlink.tar.gz"
tar --list --verbose --gzip --file="${TEMP_ROOT}/hardlink.tar.gz" | grep '^h' >/dev/null \
  || fail "hardlink fixture was not encoded as a hard link"
expect_reject "${TEMP_ROOT}/hardlink.tar.gz" "hardlink"

FIFO="${TEMP_ROOT}/fifo"
cp -a "${BASE}" "${FIFO}"
mkfifo "${FIFO}/dist/client/stream"
archive_tree "${FIFO}" "${TEMP_ROOT}/fifo.tar.gz"
expect_reject "${TEMP_ROOT}/fifo.tar.gz" "FIFO"

DEVICE_RAW="${TEMP_ROOT}/device.tar"
tar -C "${BASE}" -cf "${DEVICE_RAW}" dist migrations package.json pnpm-lock.yaml
tar --append --file="${DEVICE_RAW}" --transform='s#^dev/null$#dist/client/device#' -C / dev/null \
  || fail "host could not construct the required device archive fixture"
tar --list --verbose --file="${DEVICE_RAW}" | grep '^c.* dist/client/device$' >/dev/null \
  || fail "device fixture was not encoded as a character device"
gzip -c "${DEVICE_RAW}" >"${TEMP_ROOT}/device.tar.gz"
expect_reject "${TEMP_ROOT}/device.tar.gz" "device"

TRAVERSAL_RAW="${TEMP_ROOT}/traversal.tar"
EXTRA="${TEMP_ROOT}/extra"
install -d "${EXTRA}"
install -m 0644 /dev/null "${EXTRA}/payload"
tar -C "${BASE}" -cf "${TRAVERSAL_RAW}" dist migrations package.json pnpm-lock.yaml
tar --append --file="${TRAVERSAL_RAW}" --transform='s#^payload$#dist/../escape#' -C "${EXTRA}" payload
gzip -c "${TRAVERSAL_RAW}" >"${TEMP_ROOT}/traversal.tar.gz"
expect_reject "${TEMP_ROOT}/traversal.tar.gz" "path traversal"

CONTROL="${TEMP_ROOT}/control"
cp -a "${BASE}" "${CONTROL}"
install -m 0644 /dev/null "${CONTROL}/dist/client/"$'bad\nname'
archive_tree "${CONTROL}" "${TEMP_ROOT}/control.tar.gz"
expect_reject "${TEMP_ROOT}/control.tar.gz" "control-character path"

UNEXPECTED="${TEMP_ROOT}/unexpected"
cp -a "${BASE}" "${UNEXPECTED}"
install -m 0644 /dev/null "${UNEXPECTED}/README.md"
tar -C "${UNEXPECTED}" -czf "${TEMP_ROOT}/unexpected.tar.gz" \
  dist migrations package.json pnpm-lock.yaml README.md
expect_reject "${TEMP_ROOT}/unexpected.tar.gz" "unexpected top-level path"

WRONG_TYPE="${TEMP_ROOT}/wrong-type"
cp -a "${BASE}" "${WRONG_TYPE}"
rm -f "${WRONG_TYPE}/package.json"
install -d "${WRONG_TYPE}/package.json"
archive_tree "${WRONG_TYPE}" "${TEMP_ROOT}/wrong-type.tar.gz"
expect_reject "${TEMP_ROOT}/wrong-type.tar.gz" "wrong required type"

DUPLICATE_RAW="${TEMP_ROOT}/duplicate.tar"
tar -C "${BASE}" -cf "${DUPLICATE_RAW}" dist migrations package.json pnpm-lock.yaml
tar --append --file="${DUPLICATE_RAW}" -C "${BASE}" package.json
gzip -c "${DUPLICATE_RAW}" >"${TEMP_ROOT}/duplicate.tar.gz"
expect_reject "${TEMP_ROOT}/duplicate.tar.gz" "duplicate path"

TREE="${TEMP_ROOT}/tree"
cp -a "${BASE}" "${TREE}"
validate_release_tree "${TREE}" >/dev/null 2>&1 || fail "valid extracted tree was rejected"
ln -s ../index.html "${TREE}/dist/client/tree-link"
if validate_release_tree "${TREE}" >/dev/null 2>&1; then
  fail "post-extract symlink defense accepted a link"
fi

TREE_HARDLINK="${TEMP_ROOT}/tree-hardlink"
cp -a "${BASE}" "${TREE_HARDLINK}"
ln "${TREE_HARDLINK}/package.json" "${TREE_HARDLINK}/dist/client/tree-hardlink"
if validate_release_tree "${TREE_HARDLINK}" >/dev/null 2>&1; then
  fail "post-extract hardlink defense accepted a hard link"
fi

TREE_MAP="${TEMP_ROOT}/tree-map"
cp -a "${BASE}" "${TREE_MAP}"
install -d "${TREE_MAP}/dist/client/hidden.map"
if validate_release_tree "${TREE_MAP}" >/dev/null 2>&1; then
  fail "post-extract source-map defense accepted a map path"
fi

printf 'PASS: release archive and extracted-tree fault validation\n'
