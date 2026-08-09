#!/usr/bin/env bash
# Jokas ERP — Database restore from a real production backup (MySQL)
#
# C7: this script previously called pg_restore/psql against PostgreSQL —
# production is MySQL on bare-metal Hostinger (Passenger + start.js, no
# Docker). There was no restore tooling that even targeted the right
# database engine. This is the emergency "restore right now" script; for a
# periodic, non-destructive drill that doesn't touch the real database, use
# scripts/verify-backup-restore.sh instead.
#
# Usage (run over SSH on the Hostinger host, as the app user):
#   ./restore-db.sh ~/jokas-db-backups/db-20260809.sql.gz
#
# WARNING: This DROPS and RECREATES the target database. All existing data
#          is permanently deleted. Take a fresh backup first if possible
#          (mysqldump --defaults-file=$HOME/.jokas-backup.cnf --single-transaction --routines <db> | gzip > pre-restore-safety.sql.gz).
set -euo pipefail

BACKUP_FILE="${1:?Usage: restore-db.sh <backup-file.sql.gz>}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

# The same credentials file deploy.yml's "Setup database backup cron" step
# writes on every deploy — a MySQL [client] option file with host/port/user/
# password/database, chmod 600. Not a fictional backup.env; the real thing.
CNF_FILE="${JOKAS_BACKUP_CNF:-$HOME/.jokas-backup.cnf}"
if [[ ! -f "$CNF_FILE" ]]; then
  echo "ERROR: $CNF_FILE not found. This script must run on the production host"
  echo "       (or set JOKAS_BACKUP_CNF to point at an equivalent [client] file)."
  exit 1
fi

DB_NAME="$(grep '^database=' "$CNF_FILE" | head -1 | cut -d= -f2-)"
if [[ -z "$DB_NAME" ]]; then
  echo "ERROR: Could not read database= from $CNF_FILE"
  exit 1
fi

# gzip integrity check before we touch anything destructive.
echo "Step 1/4: Verifying backup file integrity..."
gzip -t "$BACKUP_FILE" || { echo "ERROR: Backup file is not valid gzip. Aborting."; exit 1; }
SIZE_BYTES="$(wc -c < "$BACKUP_FILE")"
if [[ "$SIZE_BYTES" -lt 1024 ]]; then
  echo "ERROR: Backup file is suspiciously small (${SIZE_BYTES} bytes) — likely the empty-dump bug. Aborting."
  exit 1
fi
echo "Backup integrity OK (${SIZE_BYTES} bytes gzipped)."

echo ""
echo "======================================================================"
echo " Jokas ERP — DATABASE RESTORE"
echo "======================================================================"
echo ""
echo "  Source backup : ${BACKUP_FILE}"
echo "  Credentials   : ${CNF_FILE}"
echo "  Target db     : ${DB_NAME}"
echo ""
echo "  WARNING: This will DROP and RECREATE '${DB_NAME}'."
echo "           ALL EXISTING DATA WILL BE PERMANENTLY DELETED."
echo ""
echo -n "  Type 'yes-restore' to continue: "
read -r CONFIRM

if [[ "$CONFIRM" != "yes-restore" ]]; then
  echo "Restore cancelled."
  exit 0
fi

echo ""
echo "Step 2/4: Dropping and recreating database '${DB_NAME}'..."
mysql --defaults-file="$CNF_FILE" -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`; CREATE DATABASE \`${DB_NAME}\`;"
echo "Database recreated."

echo ""
echo "Step 3/4: Restoring from ${BACKUP_FILE}..."
gunzip -c "$BACKUP_FILE" | mysql --defaults-file="$CNF_FILE" "$DB_NAME"

echo ""
echo "Step 4/4: Sanity-checking row counts on a few core tables..."
mysql --defaults-file="$CNF_FILE" "$DB_NAME" -e "
  SELECT 'User' AS \`table\`, COUNT(*) AS rows FROM User
  UNION ALL SELECT 'Company', COUNT(*) FROM Company
  UNION ALL SELECT 'Employee', COUNT(*) FROM Employee
  UNION ALL SELECT 'InventoryItem', COUNT(*) FROM InventoryItem
  UNION ALL SELECT 'SalesOrder', COUNT(*) FROM SalesOrder;
" || echo "  (Sanity query failed — schema may differ from expected; restore itself may still be fine, investigate manually.)"

echo ""
echo "======================================================================"
echo " Restore COMPLETE."
echo " Verify the application by:"
echo "   1. Restarting the app (touch the Passenger restart.txt, or redeploy)"
echo "   2. Logging into the web UI and checking key records"
echo "   3. Confirming the most recent audit log entry looks right"
echo "======================================================================"
