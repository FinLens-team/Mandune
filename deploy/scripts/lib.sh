#!/usr/bin/env bash

set -Eeuo pipefail

readonly SERVICE_NAME="mandong.service"
readonly SERVICE_USER="mandong"
readonly RELEASE_ROOT="/opt/mandong/releases"
readonly CURRENT_LINK="/opt/mandong/current"
readonly RUNTIME_ROOT="/opt/mandong/runtime"
readonly NODE_BIN="${RUNTIME_ROOT}/node"
readonly COREPACK_BIN="${RUNTIME_ROOT}/corepack"
readonly STATE_ROOT="/var/lib/mandong"
readonly DB_PATH="${STATE_ROOT}/mandong.sqlite3"
readonly BACKUP_ROOT="/var/backups/mandong"
readonly METADATA_ROOT="${BACKUP_ROOT}/releases"
readonly RELEASE_ENV="/etc/mandong/release.env"
readonly HEALTH_URL="http://127.0.0.1:8787/health"
readonly DEPLOY_LOCK="/run/lock/mandong-deploy.lock"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_root() {
  [[ ${EUID} -eq 0 ]] || die "run this command as root"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

validate_commit_sha() {
  [[ $1 =~ ^[0-9a-f]{40}$ ]] || die "commit SHA must be 40 lowercase hexadecimal characters"
}

validate_archive_member_name() {
  local member=$1
  local normalized
  local segment
  local -a segments

  [[ -n ${member} && ${member} != /* && ${member} != *\\* ]] || return 1
  normalized="${member%/}"
  [[ -n ${normalized} && ${normalized} != */ ]] || return 1
  IFS='/' read -r -a segments <<<"${normalized}"
  for segment in "${segments[@]}"; do
    [[ -n ${segment} && ${segment} != "." && ${segment} != ".." ]] || return 1
    [[ ${segment} =~ ^[A-Za-z0-9._@+~=-]+$ ]] || return 1
  done

  case "${normalized}" in
    dist|dist/*|migrations|migrations/*|package.json|pnpm-lock.yaml) return 0 ;;
    *) return 1 ;;
  esac
}

validate_release_archive() {
  local archive=$1
  local manifest_root
  local names
  local verbose
  local member
  local normalized
  local details
  local member_type
  local name_count
  local verbose_count
  local required
  local -A seen=()
  local -A types=()

  [[ -f ${archive} && ! -L ${archive} ]] || {
    printf 'ERROR: release archive must be a regular file\n' >&2
    return 1
  }
  manifest_root="$(mktemp -d)" || return 1
  names="${manifest_root}/names"
  verbose="${manifest_root}/verbose"
  if ! tar --gzip --list --quoting-style=escape --file="${archive}" >"${names}" ||
    ! tar --gzip --list --verbose --quoting-style=escape --file="${archive}" >"${verbose}"; then
    rm -rf "${manifest_root}"
    printf 'ERROR: release archive manifest could not be read\n' >&2
    return 1
  fi
  name_count="$(wc -l <"${names}")"
  verbose_count="$(wc -l <"${verbose}")"
  if [[ ${name_count} -eq 0 || ${name_count} -ne ${verbose_count} ]]; then
    rm -rf "${manifest_root}"
    printf 'ERROR: release archive manifest is empty or ambiguous\n' >&2
    return 1
  fi

  while IFS=$'\t' read -r member details; do
    if ! validate_archive_member_name "${member}"; then
      rm -rf "${manifest_root}"
      printf 'ERROR: release archive contains an unsafe or unexpected path\n' >&2
      return 1
    fi
    normalized="${member%/}"
    member_type="${details:0:1}"
    if [[ ${member_type} != "-" && ${member_type} != "d" ]]; then
      rm -rf "${manifest_root}"
      printf 'ERROR: release archive contains a link or special file\n' >&2
      return 1
    fi
    if [[ -n ${seen[${normalized}]+present} ]]; then
      rm -rf "${manifest_root}"
      printf 'ERROR: release archive contains a duplicate path\n' >&2
      return 1
    fi
    seen["${normalized}"]=1
    types["${normalized}"]="${member_type}"
  done < <(paste "${names}" "${verbose}")
  rm -rf "${manifest_root}"

  for required in dist/server/index.js dist/client/index.html package.json pnpm-lock.yaml; do
    if [[ ${types[${required}]:-} != "-" ]]; then
      printf 'ERROR: release archive is missing regular file %s\n' "${required}" >&2
      return 1
    fi
  done
  if [[ ${types[migrations]:-} != "d" ]]; then
    printf 'ERROR: release archive is missing directory migrations\n' >&2
    return 1
  fi
}

validate_release_tree() {
  local root=$1
  local unexpected
  local relative

  unexpected="$(find "${root}" -xdev -mindepth 1 ! -type f ! -type d -print -quit)"
  [[ -z ${unexpected} ]] || {
    printf 'ERROR: extracted release contains a link or special file\n' >&2
    return 1
  }
  unexpected="$(find "${root}" -xdev -type f -links +1 -print -quit)"
  [[ -z ${unexpected} ]] || {
    printf 'ERROR: extracted release contains a hard-linked file\n' >&2
    return 1
  }
  while IFS= read -r relative; do
    relative="${relative#./}"
    [[ -z ${relative} ]] && continue
    validate_archive_member_name "${relative}" || {
      printf 'ERROR: extracted release contains an unexpected path\n' >&2
      return 1
    }
  done < <(find "${root}" -xdev -mindepth 1 -printf '%P\n')

  for relative in dist/server/index.js dist/client/index.html package.json pnpm-lock.yaml; do
    [[ -f ${root}/${relative} && ! -L ${root}/${relative} ]] || {
      printf 'ERROR: extracted release is missing regular file %s\n' "${relative}" >&2
      return 1
    }
  done
  [[ -d ${root}/migrations && ! -L ${root}/migrations ]] || {
    printf 'ERROR: extracted release is missing directory migrations\n' >&2
    return 1
  }
  if find "${root}/dist/client" -xdev -name '*.map' -print -quit | grep -q .; then
    printf 'ERROR: release archive contains public client source maps\n' >&2
    return 1
  fi
}

acquire_deploy_lock() {
  require_command flock
  exec 9>"${DEPLOY_LOCK}"
  flock -n 9 || die "another Mandong deploy or rollback is active"
}

current_release() {
  local resolved
  if [[ ! -e ${CURRENT_LINK} && ! -L ${CURRENT_LINK} ]]; then
    return 0
  fi
  [[ -L ${CURRENT_LINK} ]] || die "current release path exists but is not a symlink"
  resolved="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"
  [[ -n ${resolved} ]] || die "current release symlink cannot be resolved"
  [[ ${resolved} == "${RELEASE_ROOT}/"* ]] || die "current symlink escapes the release root"
  [[ -d ${resolved} ]] || die "current release target is not a directory"
  printf '%s\n' "${resolved}"
}

atomic_symlink() {
  local target=$1
  local temporary="${CURRENT_LINK}.next.$$"
  rm -f "${temporary}" || return 1
  ln -s "${target}" "${temporary}" || return 1
  mv -Tf "${temporary}" "${CURRENT_LINK}" || return 1
}

write_release_environment() {
  local sha=$1
  local release=$2
  local temporary
  temporary="$(mktemp /etc/mandong/release.env.XXXXXX)" || return 1
  chmod 0600 "${temporary}" || return 1
  {
    printf 'APP_VERSION=%s\n' "${sha}"
    printf 'MANDONG_MIGRATIONS_DIR=%s/migrations\n' "${release}"
  } >"${temporary}" || return 1
  chown root:root "${temporary}" || return 1
  mv -f "${temporary}" "${RELEASE_ENV}" || return 1
}

remove_release_environment() {
  rm -f "${RELEASE_ENV}"
}

stop_service() {
  systemctl stop "${SERVICE_NAME}"
  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    die "service remained active after stop"
  fi
}

database_integrity_check() {
  local database=$1
  local result
  result="$(sqlite3 -batch "${database}" 'PRAGMA integrity_check;')"
  [[ ${result} == "ok" ]]
}

backup_database() {
  local destination=$1
  local temporary="${destination}.tmp.$$"
  [[ -f ${DB_PATH} ]] || {
    printf 'ERROR: database backup requested but database is absent\n' >&2
    return 1
  }
  database_integrity_check "${DB_PATH}" || {
    printf 'ERROR: source database integrity check failed\n' >&2
    return 1
  }
  rm -f "${temporary}" || return 1
  sqlite3 -batch "${DB_PATH}" ".backup '${temporary}'" || {
    rm -f "${temporary}"
    return 1
  }
  database_integrity_check "${temporary}" || {
    rm -f "${temporary}"
    printf 'ERROR: database backup integrity check failed\n' >&2
    return 1
  }
  chown root:root "${temporary}" || return 1
  chmod 0600 "${temporary}" || return 1
  mv -f "${temporary}" "${destination}" || return 1
}

restore_database() {
  local was_present=$1
  local backup=$2
  if [[ ${was_present} == "1" ]]; then
    [[ -f ${backup} ]] || {
      printf 'ERROR: required database snapshot is absent\n' >&2
      return 1
    }
    database_integrity_check "${backup}" || {
      printf 'ERROR: database snapshot integrity check failed\n' >&2
      return 1
    }
  elif [[ ${was_present} != "0" ]]; then
    printf 'ERROR: invalid database-presence marker\n' >&2
    return 1
  fi

  rm -f "${DB_PATH}" "${DB_PATH}-wal" "${DB_PATH}-shm" || return 1
  if [[ ${was_present} == "1" ]]; then
    sqlite3 -batch "${backup}" ".backup '${DB_PATH}'" || return 1
    database_integrity_check "${DB_PATH}" || {
      printf 'ERROR: restored database integrity check failed\n' >&2
      return 1
    }
    chown "${SERVICE_USER}:${SERVICE_USER}" "${DB_PATH}" || return 1
    chmod 0600 "${DB_PATH}" || return 1
  fi
}

verify_health_version() {
  local expected=$1
  local response
  response="$(mktemp)"
  chmod 0600 "${response}"
  if ! curl --fail --silent --show-error --max-time 5 "${HEALTH_URL}" >"${response}"; then
    rm -f "${response}"
    return 1
  fi
  if ! "${NODE_BIN}" -e '
    const fs = require("node:fs");
    const [file, expected] = process.argv.slice(1);
    const body = JSON.parse(fs.readFileSync(file, "utf8"));
    if (body.status !== "ok" || body.service !== "mandong" || body.version !== expected) process.exit(1);
  ' "${response}" "${expected}"; then
    rm -f "${response}"
    return 1
  fi
  rm -f "${response}"
}

start_and_verify() {
  local expected=$1
  local attempt
  systemctl start "${SERVICE_NAME}" || return 1
  for attempt in $(seq 1 30); do
    if verify_health_version "${expected}"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

metadata_value() {
  local file=$1
  local key=$2
  local line
  line="$(grep -F "${key}=" "${file}" | tail -n 1 || true)"
  [[ -n ${line} ]] || die "release metadata is missing ${key}"
  printf '%s\n' "${line#*=}"
}

write_release_metadata() {
  local sha=$1
  local previous=$2
  local db_present=$3
  local backup=$4
  local metadata="${METADATA_ROOT}/${sha}.meta"
  local temporary="${metadata}.tmp.$$"
  {
    printf 'RELEASE_SHA=%s\n' "${sha}"
    printf 'PREVIOUS_RELEASE=%s\n' "${previous}"
    printf 'PREVIOUS_DB_PRESENT=%s\n' "${db_present}"
    printf 'PRE_MIGRATION_BACKUP=%s\n' "${backup}"
  } >"${temporary}" || return 1
  chown root:root "${temporary}" || return 1
  chmod 0600 "${temporary}" || return 1
  mv -f "${temporary}" "${metadata}" || return 1
}

activate_release() {
  local release=$1
  local sha=$2
  atomic_symlink "${release}" || return 1
  write_release_environment "${sha}" "${release}" || return 1
}

deactivate_all_releases() {
  rm -f "${CURRENT_LINK}"
  remove_release_environment
}
