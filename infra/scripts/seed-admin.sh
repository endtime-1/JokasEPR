#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# seed-admin.sh — Seed the database with permissions, roles, and the first
#                 Super Admin user, then optionally load demo data.
#
# Usage:
#   ./infra/scripts/seed-admin.sh            # full seed (demo data included)
#   ./infra/scripts/seed-admin.sh --minimal  # permissions + roles + admin only
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  exit 1
fi

MODE="${1:-full}"

if [[ "$MODE" == "--minimal" ]]; then
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  Minimal seed: permissions, roles, first Super Admin"
  echo "══════════════════════════════════════════════════════════"
  echo ""
  echo "Run this SQL against your production database:"
  echo "(Replace values in ALL_CAPS before executing)"
  echo ""
  # Print the SQL that creates the bare minimum: company + admin user
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec postgres \
    psql -U "$(grep POSTGRES_USER "$ENV_FILE" | cut -d= -f2 | tr -d '"')" \
         -d "$(grep POSTGRES_DB   "$ENV_FILE" | cut -d= -f2 | tr -d '"')" \
    -c "SELECT 'Minimal seed: run packages/db/prisma/seed.ts manually with SEED_MINIMAL=true';"
  echo ""
  echo "→ To run the minimal seed, set SEED_MINIMAL=true and execute:"
  echo "  docker compose -f $COMPOSE_FILE exec api pnpm --filter @jokas/db prisma:seed"
  echo ""
  echo "  Or run full seed (includes demo farms/products) without the flag:"
else
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  Full seed: demo company, roles, permissions, admin user"
  echo "  WARNING: Only run this on a FRESH (empty) database."
  echo "  It will fail if records already exist (idempotent IDs)."
  echo "══════════════════════════════════════════════════════════"
  echo ""
  read -rp "  Continue? [y/N] " confirm
  if [[ "${confirm,,}" != "y" ]]; then
    echo "  Aborted."
    exit 0
  fi

  echo "→ Running seed script..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec api \
    pnpm --filter @jokas/db prisma:seed

  echo ""
  echo "✓ Seed complete. Default credentials:"
  echo "  Email:    admin@jokas.local"
  echo "  Password: Admin@12345"
  echo ""
  echo "  CHANGE THE PASSWORD immediately after first login!"
  echo "  Profile → Change Password"
fi
