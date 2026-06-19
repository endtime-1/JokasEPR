#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# restore.sh — Restore a PostgreSQL backup to the production database.
#
# Usage:
#   ./infra/scripts/restore.sh ./backups/jokas_erp_20260616_030000.sql.gz
#
# WARNING: This DROPS and recreates the database. All current data is lost.
#          Always take a fresh backup before restoring.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
DUMP_FILE="${1:-}"

if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "Usage: $0 <path-to-backup.sql.gz>"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  exit 1
fi

POSTGRES_USER=$(grep '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2 | tr -d '"')
POSTGRES_DB=$(grep '^POSTGRES_DB='   "$ENV_FILE" | cut -d= -f2 | tr -d '"')

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  RESTORE DATABASE"
echo "  Source: $DUMP_FILE"
echo "  Target: $POSTGRES_DB (all existing data will be lost)"
echo "══════════════════════════════════════════════════════════"
echo ""
read -rp "  Are you sure? This is DESTRUCTIVE. [yes/N] " confirm
if [[ "$confirm" != "yes" ]]; then
  echo "  Aborted."
  exit 0
fi

echo "→ Stopping API to prevent writes during restore..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop api web

echo "→ Dropping and recreating database..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" postgres \
  -c "DROP DATABASE IF EXISTS $POSTGRES_DB;" \
  -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;"

echo "→ Restoring from $DUMP_FILE ..."
gunzip -c "$DUMP_FILE" | \
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "→ Restarting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" start api web

echo ""
echo "✓ Restore complete. Verify with:"
echo "  ./infra/scripts/logs.sh api"
