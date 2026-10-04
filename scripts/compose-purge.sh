#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${RAKAZO_ALLOW_VOLUME_PURGE:-}" != "1" ]]; then
  echo "Refusing to delete Compose volumes. Set RAKAZO_ALLOW_VOLUME_PURGE=1 explicitly." >&2
  exit 1
fi

exec docker compose --env-file .env -f infra/compose/docker-compose.yml down -v
