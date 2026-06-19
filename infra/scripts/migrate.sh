#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# migrate.sh — Run Prisma database migrations in production
#
# Usage:
#   ./infra/scripts/migrate.sh              # run pending migrations
#   ./infra/scripts/migrate.sh --check      # check if migrations are pending (exit 1 if yes)
#   ./infra/scripts/migrate.sh --status     # show migration history
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.production.example and fill it in."
  exit 1
fi

ACTION="${1:-deploy}"

case "$ACTION" in
  --check)
    echo "→ Checking for pending migrations..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec api \
      pnpm --filter @jokas/db exec prisma migrate status \
        --schema=packages/db/prisma/schema.prisma
    ;;
  --status)
    echo "→ Migration history:"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec api \
      pnpm --filter @jokas/db exec prisma migrate status \
        --schema=packages/db/prisma/schema.prisma
    ;;
  deploy|*)
    echo "→ Running pending migrations..."
    # 'prisma migrate deploy' is safe for production:
    #   - applies only pending migrations
    #   - never resets the database
    #   - never generates new migration files
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec api \
      pnpm --filter @jokas/db exec prisma migrate deploy \
        --schema=packages/db/prisma/schema.prisma
    echo "✓ Migrations applied successfully."
    ;;
esac
