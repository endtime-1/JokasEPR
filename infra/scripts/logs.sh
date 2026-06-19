#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# logs.sh — Tail logs from one or all production services
#
# Usage:
#   ./infra/scripts/logs.sh              # tail all services
#   ./infra/scripts/logs.sh api          # tail API only
#   ./infra/scripts/logs.sh api -n 200   # last 200 lines of API
#   ./infra/scripts/logs.sh nginx        # tail nginx access/error logs
#   ./infra/scripts/logs.sh postgres     # tail postgres logs
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
SERVICE="${1:-}"
shift || true  # remaining args passed to 'docker compose logs'

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  exit 1
fi

exec docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  logs --follow --timestamps ${SERVICE:+"$SERVICE"} "$@"
