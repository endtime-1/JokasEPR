#!/usr/bin/env bash
# ============================================================================
# ONE-TIME migration-history reconciliation on the VPS
# ----------------------------------------------------------------------------
# The old Hostinger deploy pipeline hand-inserted rows into `_prisma_migrations`
# with an EMPTY checksum. `prisma migrate deploy` on the VPS will treat those
# as "modified since applied" and refuse to run. This re-records every applied
# migration through Prisma's own `migrate resolve` (which computes the correct
# checksum), so `migrate deploy` is clean from then on.
#
# Run ONCE, as the `deploy` user, AFTER importing the database dump and AFTER
# `pnpm install` + `prisma generate` (deploy.sh's first half), but you can
# also just run it standalone:
#     cd /opt/jokas/app && bash infra/vps/reconcile-migrations.sh
#
# Safe to re-run: rows that already have a real checksum are skipped.
# Backs up the _prisma_migrations table first.
# ============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"
PRISMA_BIN="node_modules/.bin/prisma"
SCHEMA="packages/db/prisma/schema.prisma"
BACKUP_DIR="/opt/jokas/backups"

[ -f .env ] || { echo "ERROR: .env missing"; exit 1; }
[ -x "$PRISMA_BIN" ] || { echo "ERROR: run 'pnpm install' first ($PRISMA_BIN not found)"; exit 1; }

DATABASE_URL=$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')
[ -n "$DATABASE_URL" ] || { echo "ERROR: DATABASE_URL not in .env"; exit 1; }
export DATABASE_URL

_u="${DATABASE_URL#mysql://}"
DB_USER="${_u%%:*}"; _ap="${_u#*:}"
DB_PASS="${_ap%@*}"; _hp="${_ap##*@}"
DB_HOST="${_hp%%[:/*]*}"; _ah="${_hp#"$DB_HOST"}"
case "$_ah" in :*) DB_PORT="${_ah#:}"; DB_PORT="${DB_PORT%%/*}" ;; *) DB_PORT="3306" ;; esac
DB_NAME="${_hp#*/}"; DB_NAME="${DB_NAME%%[?#]*}"

umask 077
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\ndatabase=%s\n' \
  "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASS" "$DB_NAME" > /tmp/reconcile-my.cnf
MYSQL="mysql --defaults-file=/tmp/reconcile-my.cnf --batch --silent"
trap 'rm -f /tmp/reconcile-my.cnf' EXIT

mkdir -p "$BACKUP_DIR"
BK="$BACKUP_DIR/_prisma_migrations-pre-reconcile-$(date +%Y%m%d%H%M%S).sql"
mysqldump --defaults-file=/tmp/reconcile-my.cnf "$DB_NAME" _prisma_migrations > "$BK"
echo "==> Backed up _prisma_migrations to $BK"

APPLIED=$($MYSQL -N -e "SELECT migration_name FROM \`_prisma_migrations\` WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND checksum='' ORDER BY started_at;")
ROLLED=$($MYSQL -N -e "SELECT migration_name FROM \`_prisma_migrations\` WHERE rolled_back_at IS NOT NULL AND checksum='';")

if [ -z "$APPLIED" ] && [ -z "$ROLLED" ]; then
  echo "==> Nothing to reconcile — all rows already have real checksums."
else
  while IFS= read -r m; do [ -z "$m" ] && continue
    echo "  [applied]     $m"
    $MYSQL -e "DELETE FROM \`_prisma_migrations\` WHERE migration_name='$m' AND checksum='';"
    "$PRISMA_BIN" migrate resolve --applied "$m" --schema="$SCHEMA"
    sleep 1
  done <<< "$APPLIED"
  while IFS= read -r m; do [ -z "$m" ] && continue
    echo "  [rolled-back] $m"
    $MYSQL -e "DELETE FROM \`_prisma_migrations\` WHERE migration_name='$m' AND checksum='';"
    "$PRISMA_BIN" migrate resolve --rolled-back "$m" --schema="$SCHEMA"
    sleep 1
  done <<< "$ROLLED"
fi

echo
echo "==> prisma migrate status:"
"$PRISMA_BIN" migrate status --schema="$SCHEMA"
echo
echo "Reconciliation complete. deploy.sh's 'prisma migrate deploy' is now safe."
