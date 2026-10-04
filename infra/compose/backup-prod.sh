#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${RAKAZO_DEPLOY_DIR:-/srv/rakazo}"
[[ "${PROJECT_DIR}" == /* ]] || { echo "RAKAZO_DEPLOY_DIR must be an absolute path" >&2; exit 1; }
ENV_FILE="${PROJECT_DIR}/.env"
BACKUP_ROOT="/var/backups/rakazo"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAPSHOT_DIR="${BACKUP_ROOT}/${STAMP}"

install -d -m 700 "${BACKUP_ROOT}" "${SNAPSHOT_DIR}"

env_value() {
  local key="$1"
  [[ -r "${ENV_FILE}" ]] || return 0
  sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1
}

compose_file_setting="${RAKAZO_COMPOSE_FILE:-$(env_value RAKAZO_COMPOSE_FILE)}"
compose_file_setting="${compose_file_setting:-infra/compose/docker-compose.prod.yml}"
compose_path_separator="${COMPOSE_PATH_SEPARATOR:-$(env_value COMPOSE_PATH_SEPARATOR)}"
compose_path_separator="${compose_path_separator:-:}"
IFS="${compose_path_separator}" read -r -a compose_files <<<"${compose_file_setting}"
compose=(docker compose --env-file "${ENV_FILE}")
for compose_file in "${compose_files[@]}"; do
  [[ -n "${compose_file}" && "${compose_file}" != /* ]] || {
    echo "RAKAZO_COMPOSE_FILE must contain relative, non-empty paths" >&2
    exit 1
  }
  compose+=(-f "${PROJECT_DIR}/${compose_file}")
done

"${compose[@]}" exec -T postgres sh -c \
  'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "${SNAPSHOT_DIR}/rakazo.dump"

# Archive the appdata volume from the host, not through `compose exec api`.
#
# The api image runs as `USER node` (uid 1000) with `cap_drop: ALL`, while the
# supervisor creates each bot computer's home under /data as root with mode 600
# (receipts, taught skills, connector tokens). Inside a cap-dropped container
# uid 1000 cannot read those files, so `tar` exits 2 and the archive it leaves
# behind is missing exactly the bot state a restore needs. Root on the host has
# CAP_DAC_OVERRIDE and reads all of it.
#
# Ask the running container where /data actually is, rather than rebuilding the
# volume name from a project name. `compose config` reports this file's `name:`
# key and ignores an operator's `-p` or COMPOSE_PROJECT_NAME, so reconstructing
# "<project>_appdata" would inspect the default project's volume on any stack
# started under another name, and silently archive the wrong one. This uses the
# same compose invocation as the pg_dump above, so both target one stack.
api="$("${compose[@]}" ps -q api)"
[[ -n "${api}" ]] || { echo "the api service is not running; cannot locate /data" >&2; exit 1; }
appdata="$(docker inspect "${api}" \
  --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}')"
[[ -n "${appdata}" ]] || { echo "the api container has no /data mount" >&2; exit 1; }

# Bots write while this runs. GNU tar exits 1 for "file changed as we read it",
# which is expected on a live system and still yields a usable archive; only a
# fatal error (2) fails the backup.
rc=0
tar -czf "${SNAPSHOT_DIR}/appdata.tgz" --numeric-owner -C "${appdata}" . || rc=$?
if [[ "${rc}" -gt 1 ]]; then
  echo "appdata archive failed with tar exit ${rc}" >&2
  exit "${rc}"
fi

"${compose[@]}" exec -T postgres pg_restore --list \
  < "${SNAPSHOT_DIR}/rakazo.dump" >/dev/null
tar -tzf "${SNAPSHOT_DIR}/appdata.tgz" >/dev/null

sha256sum "${SNAPSHOT_DIR}/rakazo.dump" "${SNAPSHOT_DIR}/appdata.tgz" \
  > "${SNAPSHOT_DIR}/SHA256SUMS"
cat >"${SNAPSHOT_DIR}/MANIFEST" <<EOF
format=rakazo-production-backup-v1
created_at=${STAMP}
deployment_dir=${PROJECT_DIR}
compose_files=${compose_file_setting}
postgres_dump=rakazo.dump
application_data=appdata.tgz
secret_continuity=required
secret_escrow=external-encrypted-operator-store
restore_order=secrets,postgres,appdata,services
EOF
chmod 600 "${SNAPSHOT_DIR}"/*

# Keep seven daily snapshots. BACKUP_ROOT is intentionally fixed above so this
# cleanup can never expand to an environment-controlled or broad path.
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +6 -exec rm -rf -- {} +

echo "Verified Rakazo backup written to ${SNAPSHOT_DIR}"
