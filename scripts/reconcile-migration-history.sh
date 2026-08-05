#!/bin/bash
# ONE-TIME, MANUAL migration-history reconciliation.
#
# STATUS AS OF 2026-08-05: this script already did its job — production's
# `_prisma_migrations` table has real checksums now (confirmed via
# `prisma migrate status` reporting "Database schema is up to date!").
# BUT deploy.yml's migration step was reverted back to the hand-rolled SQL
# runner after `prisma migrate deploy` turned out to hang indefinitely on this
# host (see deploy.yml's "Run database migrations" step comment, or project
# memory, for the full story — looks like a stdio-pipe deadlock between the
# CLI and its schema-engine subprocess on a large migration-history payload).
# So this script is currently NOT load-bearing for the live deploy pipeline.
# It's kept because the reconciled checksums are harmless to have, and this
# will be needed again if/when `prisma migrate deploy` is revisited and the
# hang is root-caused.
#
# Background: deploy.yml used to (and, as of the revert above, does again)
# hand-roll migration tracking — it runs each migration.sql directly via the
# mysql CLI and inserts a row into `_prisma_migrations` with checksum=''
# instead of using `prisma migrate deploy`. That means every row in
# `_prisma_migrations` normally has a checksum that does NOT match what
# Prisma's own migrate engine computes from the migration.sql files. If
# deploy.yml is ever switched to run real `prisma migrate deploy` again
# without this having been run first, every historical migration will look
# "modified since it was applied" and the deploy will fail hard.
#
# This script fixes that, once, by re-recording each already-applied migration
# through Prisma's own `migrate resolve` command (which computes the correct
# checksum itself — this script never guesses or reimplements that algorithm).
#
# Run this ONCE, by hand, via SSH, BEFORE any future attempt to switch
# deploy.yml back to `prisma migrate deploy`:
#
#   ssh -p 65002 u136486538@<host> 'bash -s' < scripts/reconcile-migration-history.sh
#
# It is safe to re-run: migrations already reconciled (non-empty checksum) are
# skipped. It backs up the `_prisma_migrations` table before touching it.
set -e

APP_DIR=~/domains/jokasfarms.com/nodejs
PRISMA_BIN="$APP_DIR/node_modules/.bin/prisma"
SCHEMA="$APP_DIR/prisma/schema.prisma"

if [ ! -x "$PRISMA_BIN" ]; then
  echo "ERROR: bundled prisma CLI not found at $PRISMA_BIN — deploy the current main branch first (it bundles the CLI), then re-run this script."
  exit 1
fi
if [ ! -f "$APP_DIR/.env" ]; then
  echo "ERROR: $APP_DIR/.env not found — cannot read DATABASE_URL."
  exit 1
fi
# Read as plain text, NOT `source`/`.` — DATABASE_URL's query string contains
# unescaped `&` (connect_timeout=30&connection_limit=5&...), and sourcing an
# unquoted `VAR=value&` line makes bash treat `&` as a background-job operator,
# silently truncating/backgrounding the assignment instead of setting it.
DATABASE_URL=$(grep '^DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2-)
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set in $APP_DIR/.env"
  exit 1
fi

_u="${DATABASE_URL#mysql://}"
DB_USER="${_u%%:*}"
_ap="${_u#*:}"
DB_PASS="${_ap%@*}"
_hp="${_ap##*@}"
DB_HOST="${_hp%%[:/*]*}"
_ah="${_hp#"$DB_HOST"}"
case "$_ah" in :*) DB_PORT="${_ah#:}"; DB_PORT="${DB_PORT%%/*}" ;; *) DB_PORT="3306" ;; esac
DB_NAME="${_hp#*/}"; DB_NAME="${DB_NAME%%[?#]*}"

printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\ndatabase=%s\n' \
  "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASS" "$DB_NAME" > /tmp/reconcile-my.cnf
chmod 600 /tmp/reconcile-my.cnf
MYSQL="mysql --defaults-file=/tmp/reconcile-my.cnf --batch --silent"
cleanup() { rm -f /tmp/reconcile-my.cnf; }
trap cleanup EXIT

echo "==> Backing up _prisma_migrations table before making any changes..."
mkdir -p "$HOME/jokas-db-backups"
BACKUP_FILE="$HOME/jokas-db-backups/prisma_migrations-pre-reconcile-$(date +%Y%m%d%H%M%S).sql"
mysqldump --defaults-file=/tmp/reconcile-my.cnf "$DB_NAME" _prisma_migrations > "$BACKUP_FILE"
echo "    Backed up to $BACKUP_FILE"

echo "==> Reading current migration history from the database..."
APPLIED=$($MYSQL -N -e "SELECT migration_name FROM \`_prisma_migrations\` WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND checksum='' ORDER BY started_at;")
ROLLED_BACK=$($MYSQL -N -e "SELECT migration_name FROM \`_prisma_migrations\` WHERE rolled_back_at IS NOT NULL AND checksum='';")

APPLIED_COUNT=$(echo "$APPLIED" | grep -c . || true)
ROLLED_BACK_COUNT=$(echo "$ROLLED_BACK" | grep -c . || true)
echo "    Found $APPLIED_COUNT applied + $ROLLED_BACK_COUNT rolled-back migration(s) with placeholder checksums."

if [ "$APPLIED_COUNT" -eq 0 ] && [ "$ROLLED_BACK_COUNT" -eq 0 ]; then
  echo "==> Nothing to reconcile — all rows already have real checksums (or table is empty)."
else
  echo "==> Re-recording each migration through Prisma's own 'migrate resolve' (computes the real checksum)..."
  FAILED=0
  if [ -n "$APPLIED" ]; then
    while IFS= read -r MIG_NAME; do
      [ -z "$MIG_NAME" ] && continue
      echo "  [applied] $MIG_NAME"
      $MYSQL -e "DELETE FROM \`_prisma_migrations\` WHERE migration_name='$MIG_NAME' AND checksum='';"
      if ! (cd "$APP_DIR" && "$PRISMA_BIN" migrate resolve --applied "$MIG_NAME" --schema="$SCHEMA"); then
        echo "  [FAIL] resolve --applied failed for $MIG_NAME"
        FAILED=$((FAILED + 1))
        break
      fi
      sleep 2
    done <<< "$APPLIED"
  fi

  if [ "$FAILED" -eq 0 ] && [ -n "$ROLLED_BACK" ]; then
    while IFS= read -r MIG_NAME; do
      [ -z "$MIG_NAME" ] && continue
      echo "  [rolled-back] $MIG_NAME"
      $MYSQL -e "DELETE FROM \`_prisma_migrations\` WHERE migration_name='$MIG_NAME' AND checksum='';"
      if ! (cd "$APP_DIR" && "$PRISMA_BIN" migrate resolve --rolled-back "$MIG_NAME" --schema="$SCHEMA"); then
        echo "  [FAIL] resolve --rolled-back failed for $MIG_NAME"
        FAILED=$((FAILED + 1))
        break
      fi
      sleep 2
    done <<< "$ROLLED_BACK"
  fi

  if [ "$FAILED" -gt 0 ]; then
    echo ""
    echo "ERROR: reconciliation stopped after a failure. Restore with:"
    echo "  mysql --defaults-file=/tmp/reconcile-my.cnf $DB_NAME < $BACKUP_FILE"
    echo "(run that BEFORE the next deploy — do not let deploy.yml's 'prisma migrate deploy' run against a half-reconciled table)"
    exit 1
  fi
fi

echo ""
echo "==> Final check — 'prisma migrate status' should report the schema is up to date:"
(cd "$APP_DIR" && "$PRISMA_BIN" migrate status --schema="$SCHEMA") || {
  echo "WARNING: migrate status reported an issue above — review before deploying the new pipeline.";
  exit 1;
}
echo ""
echo "Reconciliation complete. It is now safe to deploy the branch that switches deploy.yml to 'prisma migrate deploy'."
