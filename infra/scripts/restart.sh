#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# restart.sh — Restart one or all production services
#
# Usage:
#   ./infra/scripts/restart.sh           # restart all services
#   ./infra/scripts/restart.sh api       # restart API only (zero-downtime if > 1 replica)
#   ./infra/scripts/restart.sh web       # restart frontend only
#   ./infra/scripts/restart.sh nginx     # reload nginx (e.g. after cert renewal)
#   ./infra/scripts/restart.sh postgres  # DANGEROUS — causes downtime
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
SERVICE="${1:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  exit 1
fi

if [[ -z "$SERVICE" ]]; then
  echo "→ Restarting all services..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart
  echo "✓ All services restarted."
elif [[ "$SERVICE" == "nginx" ]]; then
  echo "→ Reloading nginx configuration (no downtime)..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec nginx \
    nginx -s reload
  echo "✓ Nginx reloaded."
else
  echo "→ Restarting $SERVICE..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart "$SERVICE"
  echo "✓ $SERVICE restarted."
fi

echo ""
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
