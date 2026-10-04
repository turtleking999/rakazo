#!/usr/bin/env bash
# Refuse to start a production stack against missing or relabelled data volumes.
#
# A first install must opt in explicitly:
#   RAKAZO_ALLOW_VOLUME_CREATE=1 infra/compose/preflight-persistence.sh
# Normal upgrades should run this without that flag before `compose up`.
set -Eeuo pipefail

PROJECT_DIR="${RAKAZO_DEPLOY_DIR:-/srv/rakazo}"
[[ "${PROJECT_DIR}" == /* ]] || {
  echo "RAKAZO_DEPLOY_DIR must be an absolute path" >&2
  exit 1
}
cd "${PROJECT_DIR}"

env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" .env | tail -n 1
}

compose_file_setting="${RAKAZO_COMPOSE_FILE:-$(env_value RAKAZO_COMPOSE_FILE)}"
compose_file_setting="${compose_file_setting:-infra/compose/docker-compose.prod.yml}"
compose_path_separator="${COMPOSE_PATH_SEPARATOR:-$(env_value COMPOSE_PATH_SEPARATOR)}"
compose_path_separator="${compose_path_separator:-:}"
IFS="${compose_path_separator}" read -r -a compose_files <<<"${compose_file_setting}"
compose_args=()
for compose_file in "${compose_files[@]}"; do
  [[ -n "${compose_file}" && "${compose_file}" != /* ]] || {
    echo "RAKAZO_COMPOSE_FILE must contain relative, non-empty paths" >&2
    exit 1
  }
  compose_args+=("-f" "${compose_file}")
done

pg_volume="${RAKAZO_PROD_PGDATA_VOLUME:-$(env_value RAKAZO_PROD_PGDATA_VOLUME)}"
pg_volume="${pg_volume:-rakazo-prod_pgdata}"
app_volume="${RAKAZO_PROD_APPDATA_VOLUME:-$(env_value RAKAZO_PROD_APPDATA_VOLUME)}"
app_volume="${app_volume:-rakazo-prod_appdata}"
adoption_file="${PROJECT_DIR}/.rakazo-volume-adoption"
pending_adoptions=()

require_volume() {
  local name="$1"
  local label="$2"
  local actual created_at
  if ! actual="$(sudo docker volume inspect \
    --format '{{with index .Labels "com.rakazo.persistence"}}{{.}}{{end}}|{{.CreatedAt}}' \
    "${name}" 2>/dev/null)"; then
    if [[ "${RAKAZO_ALLOW_VOLUME_CREATE:-0}" == "1" ]]; then
      sudo docker volume create \
        --label "com.rakazo.persistence=${label}" \
        "${name}" >/dev/null
      return
    fi
    echo "Missing persistent volume ${name}; refusing to create a new deployment." >&2
    echo "For a first install, set RAKAZO_ALLOW_VOLUME_CREATE=1 once after verifying .env." >&2
    exit 1
  fi
  created_at="${actual#*|}"
  actual="${actual%%|*}"
  if [[ "${actual}" == "${label}" ]]; then
    return
  fi
  if [[ "${actual}" == "" ]] && grep -Fqx "${label}|${name}|${created_at}" "${adoption_file}" 2>/dev/null; then
    return
  fi
  if [[ "${actual}" == "" && "${RAKAZO_ADOPT_EXISTING_VOLUMES:-0}" == "1" ]]; then
    pending_adoptions+=("${label}|${name}|${created_at}")
    return
  fi
  echo "Volume ${name} has label ${actual@Q}, expected ${label@Q}; refusing to start." >&2
  echo "After a verified backup, set RAKAZO_ADOPT_EXISTING_VOLUMES=1 once to adopt a legacy volume." >&2
  exit 1
}

require_volume "${pg_volume}" "production-postgres"
require_volume "${app_volume}" "production-appdata"
if ((${#pending_adoptions[@]} > 0)); then
  umask 077
  printf '%s\n' "${pending_adoptions[@]}" >>"${adoption_file}"
fi

api="$(
  sudo docker compose --env-file .env \
    "${compose_args[@]}" ps -q api
)"
if [[ -n "${api}" ]]; then
  mounted_pg="$(
    sudo docker inspect --format \
      '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' \
      "${api}" 2>/dev/null || true
  )"
  mounted_app="$(
    sudo docker inspect --format \
      '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' \
      "${api}" 2>/dev/null || true
  )"
  [[ -z "${mounted_pg}" || "${mounted_pg}" == "${pg_volume}" ]] || {
    echo "Running API uses Postgres volume ${mounted_pg}, expected ${pg_volume}; refusing to start." >&2
    exit 1
  }
  [[ -z "${mounted_app}" || "${mounted_app}" == "${app_volume}" ]] || {
    echo "Running API uses app-data volume ${mounted_app}, expected ${app_volume}; refusing to start." >&2
    exit 1
  }
fi

echo "Persistent volume preflight passed: ${pg_volume}, ${app_volume}"
