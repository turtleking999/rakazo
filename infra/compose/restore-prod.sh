#!/usr/bin/env bash
set -Eeuo pipefail

SNAPSHOT_DIR="${1:-}"
PROJECT_DIR="${RAKAZO_DEPLOY_DIR:-/srv/rakazo}"
[[ "${PROJECT_DIR}" == /* ]] || {
  echo "RAKAZO_DEPLOY_DIR must be an absolute path" >&2
  exit 1
}
[[ -n "${SNAPSHOT_DIR}" && -d "${SNAPSHOT_DIR}" ]] || {
  echo "usage: restore-prod.sh /var/backups/rakazo/<timestamp>" >&2
  exit 2
}
[[ -r "${SNAPSHOT_DIR}/MANIFEST" ]] || {
  echo "backup manifest is missing" >&2
  exit 1
}

cd "${PROJECT_DIR}"
ENV_FILE="${PROJECT_DIR}/.env"
[[ -r "${ENV_FILE}" ]] || {
  echo "restore requires the original .env; restore it from the encrypted operator escrow first" >&2
  exit 1
}

env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1
}

for key in POSTGRES_PASSWORD BETTER_AUTH_SECRET ENCRYPTION_KEY SCREEN_PROXY_SECRET; do
  value="$(sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1)"
  [[ -n "${value}" ]] || {
    echo "${key} is missing or empty in .env; refusing restore" >&2
    exit 1
  }
done
if [[ "$(env_value SANDBOX_PROVIDER)" == "docker" ||
  "$(env_value RAKAZO_COMPOSE_FILE)" == *docker-compose.prod.docker.yml* ]]; then
  supervisor_token="$(env_value SANDBOX_SUPERVISOR_TOKEN)"
  [[ -n "${supervisor_token}" ]] || {
    echo "SANDBOX_SUPERVISOR_TOKEN is required for Docker computers; refusing restore" >&2
    exit 1
  }
fi

sha256sum -c "${SNAPSHOT_DIR}/SHA256SUMS" --quiet
tar -tzf "${SNAPSHOT_DIR}/appdata.tgz" | awk '
  /^\// || /(^|\/)\.\.(\/|$)/ { bad = 1 }
  END { exit bad }
' || {
  echo "appdata archive contains an unsafe path" >&2
  exit 1
}

compose_file_setting="${RAKAZO_COMPOSE_FILE:-$(env_value RAKAZO_COMPOSE_FILE)}"
compose_file_setting="${compose_file_setting:-infra/compose/docker-compose.prod.yml}"
compose_path_separator="${COMPOSE_PATH_SEPARATOR:-$(env_value COMPOSE_PATH_SEPARATOR)}"
compose_path_separator="${compose_path_separator:-:}"
IFS="${compose_path_separator}" read -r -a compose_files <<<"${compose_file_setting}"
compose=(docker compose --env-file "${ENV_FILE}")
postgres_user="${POSTGRES_USER:-$(env_value POSTGRES_USER)}"
postgres_user="${postgres_user:-rakazo}"
postgres_db="${POSTGRES_DB:-$(env_value POSTGRES_DB)}"
postgres_db="${postgres_db:-rakazo}"
for compose_file in "${compose_files[@]}"; do
  [[ -n "${compose_file}" && "${compose_file}" != /* ]] || {
    echo "RAKAZO_COMPOSE_FILE must contain relative, non-empty paths" >&2
    exit 1
  }
  compose+=(-f "${PROJECT_DIR}/${compose_file}")
done

api="$("${compose[@]}" ps -q api)"
[[ -n "${api}" ]] || {
  echo "the api service is not running; refusing to guess the appdata volume" >&2
  exit 1
}
appdata="$(
  docker inspect "${api}" \
    --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}'
)"
[[ -n "${appdata}" && -d "${appdata}" ]] || {
  echo "the running api has no readable /data mount" >&2
  exit 1
}

echo "Stopping application services before restore."
"${compose[@]}" stop api worker web supervisor computer >/dev/null
trap '"${compose[@]}" up -d --remove-orphans >/dev/null || true' EXIT

"${compose[@]}" exec -T postgres pg_restore \
  --clean --if-exists --no-owner --no-privileges \
  -U "${postgres_user}" -d "${postgres_db}" \
  <"${SNAPSHOT_DIR}/rakazo.dump"

find "${appdata}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar -xzf "${SNAPSHOT_DIR}/appdata.tgz" --numeric-owner -C "${appdata}"

trap - EXIT
"${compose[@]}" up -d --remove-orphans
echo "Production restore complete from ${SNAPSHOT_DIR}"
