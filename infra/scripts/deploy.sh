#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# deploy.sh — Full production deployment (build → migrate → start)
#
# Run this on the server after pushing new code:
#   git pull origin main
#   ./infra/scripts/deploy.sh
#
# Flags:
#   --no-backup   Skip pre-deploy database backup
#   --skip-build  Use existing images (faster rollout when only config changed)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
NO_BACKUP=false
SKIP_BUILD=false

for arg in "$@"; do
  case $arg in
    --no-backup)   NO_BACKUP=true  ;;
    --skip-build)  SKIP_BUILD=true ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Jokas ERP — Production Deployment                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Pre-deploy backup ─────────────────────────────────────────────────
if [[ "$NO_BACKUP" == false ]]; then
  if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps postgres 2>/dev/null | grep -q "running"; then
    echo "Step 1/5: Backing up database..."
    ./infra/scripts/backup.sh
  else
    echo "Step 1/5: Database not running, skipping backup."
  fi
else
  echo "Step 1/5: Backup skipped (--no-backup)."
fi

# ── Step 2: Pull or build images ──────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  echo ""
  echo "Step 2/5: Building Docker images..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build \
    --build-arg NEXT_PUBLIC_API_URL="$(grep NEXT_PUBLIC_API_URL "$ENV_FILE" | cut -d= -f2 | tr -d '"')"
else
  echo ""
  echo "Step 2/5: Skipping build (--skip-build)."
fi

# ── Step 3: Start PostgreSQL ──────────────────────────────────────────────────
echo ""
echo "Step 3/5: Ensuring PostgreSQL is running..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres
echo "→ Waiting for postgres to be healthy..."
timeout 60 bash -c \
  "until docker compose -f $COMPOSE_FILE --env-file $ENV_FILE exec -T postgres pg_isready; do sleep 2; done"

# ── Step 4: Run migrations ────────────────────────────────────────────────────
echo ""
echo "Step 4/5: Running database migrations..."
# Start API container temporarily for migrations
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d api
sleep 10  # give NestJS time to start
./infra/scripts/migrate.sh

# ── Step 5: Start all services ────────────────────────────────────────────────
echo ""
echo "Step 5/5: Starting all services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# ── Health check ──────────────────────────────────────────────────────────────
echo ""
echo "→ Waiting for services to be healthy..."
sleep 15
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✓  Deployment complete!                                 ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  View logs:    ./infra/scripts/logs.sh"
echo "  Restart:      ./infra/scripts/restart.sh"
echo "  Backup:       ./infra/scripts/backup.sh"
