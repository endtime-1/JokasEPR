#!/usr/bin/env bash
# Jokas ERP — Database restore from pg_dump backup
#
# Usage:
#   ./restore-db.sh <backup-file.dump>
#   ./restore-db.sh /opt/jokas/backups/daily/jokas_daily_20260616_020001/database.dump
#
# WARNING: This will DROP and RECREATE the target database.
#          All existing data will be permanently deleted.
#          Run this only in a planned maintenance window.
set -euo pipefail

BACKUP_FILE="${1:?Usage: restore-db.sh <backup-file.dump>}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/backup.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

DATABASE_URL="${DATABASE_URL:?DATABASE_URL environment variable is required}"

# Parse connection string
strip_scheme() { echo "${1#postgresql://}"; }
REMAINDER="$(strip_scheme "$DATABASE_URL")"
USERINFO="${REMAINDER%%@*}"
REMAINDER="${REMAINDER#*@}"
DB_HOST="${REMAINDER%%:*}"
REMAINDER="${REMAINDER#*:}"
DB_PORT="${REMAINDER%%/*}"
REMAINDER="${REMAINDER#*/}"
DB_NAME="${REMAINDER%%\?*}"
DB_USER="${USERINFO%%:*}"
DB_PASS="${USERINFO#*:}"

# ─── confirmation ─────────────────────────────────────────────────────────────
echo "======================================================================"
echo " Jokas ERP — DATABASE RESTORE"
echo "======================================================================"
echo ""
echo "  Source backup : ${BACKUP_FILE}"
echo "  Target host   : ${DB_HOST}:${DB_PORT}"
echo "  Target db     : ${DB_NAME}"
echo "  DB user       : ${DB_USER}"
echo ""
echo "  ⚠  WARNING: This will DROP and RECREATE '${DB_NAME}'."
echo "              ALL EXISTING DATA WILL BE PERMANENTLY DELETED."
echo ""
echo -n "  Type 'yes-restore' to continue: "
read -r CONFIRM

if [[ "$CONFIRM" != "yes-restore" ]]; then
  echo "Restore cancelled."
  exit 0
fi

export PGPASSWORD="$DB_PASS"
PSQL_OPTS="--host=${DB_HOST} --port=${DB_PORT} --username=${DB_USER} --no-password"

# ─── verify backup integrity ──────────────────────────────────────────────────
echo ""
echo "Step 1/4: Verifying backup file integrity..."
pg_restore --list "$BACKUP_FILE" > /dev/null \
  || { echo "ERROR: Backup file appears corrupt. Aborting."; unset PGPASSWORD; exit 1; }
echo "Backup integrity OK."

# ─── terminate existing connections ───────────────────────────────────────────
echo ""
echo "Step 2/4: Terminating active connections to '${DB_NAME}'..."
psql $PSQL_OPTS --dbname=postgres --command \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
  > /dev/null 2>&1 || true

# ─── drop and recreate ────────────────────────────────────────────────────────
echo ""
echo "Step 3/4: Dropping and recreating database '${DB_NAME}'..."
psql $PSQL_OPTS --dbname=postgres --command "DROP DATABASE IF EXISTS \"${DB_NAME}\";"
psql $PSQL_OPTS --dbname=postgres --command "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";"
echo "Database recreated."

# ─── restore ──────────────────────────────────────────────────────────────────
echo ""
echo "Step 4/4: Restoring from ${BACKUP_FILE}..."
pg_restore \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --no-password \
  --verbose \
  --exit-on-error \
  "$BACKUP_FILE"

unset PGPASSWORD

echo ""
echo "======================================================================"
echo " Restore COMPLETE."
echo " Verify the application by:"
echo "   1. Running: pnpm --filter @jokas/api dev"
echo "   2. Logging into the web UI and checking key records"
echo "   3. Confirming the most recent audit log entry"
echo "======================================================================"
