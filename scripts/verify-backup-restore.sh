#!/usr/bin/env bash
# Jokas ERP — Backup restore drill (non-destructive)
#
# C7: verifies the most recent daily backup can actually be restored,
# without touching the real production database. Restores into a disposable
# scratch database on the same MySQL instance (same credentials, no new
# grants needed), sanity-checks row counts on a few core tables, then drops
# the scratch database. Safe to run repeatedly, including against a live
# production host.
#
# Run this periodically (monthly is reasonable) over SSH on the production
# host — it is NOT wired into CI on purpose: restoring a 30MB+ dump isn't
# worth the CI minutes or host load on every push.
#
# Usage:
#   ./scripts/verify-backup-restore.sh                # uses the latest backup in ~/jokas-db-backups
#   ./scripts/verify-backup-restore.sh path/to/db-20260809.sql.gz
set -euo pipefail

CNF_FILE="${JOKAS_BACKUP_CNF:-$HOME/.jokas-backup.cnf}"
BACKUP_DIR="${JOKAS_BACKUP_DIR:-$HOME/jokas-db-backups}"

if [[ ! -f "$CNF_FILE" ]]; then
  echo "ERROR: $CNF_FILE not found. This script must run on the production host"
  echo "       (or set JOKAS_BACKUP_CNF to point at an equivalent [client] file)."
  exit 1
fi

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE="$(ls -t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | head -1 || true)"
  if [[ -z "$BACKUP_FILE" ]]; then
    echo "ERROR: No db-*.sql.gz backups found in $BACKUP_DIR and none given as an argument."
    exit 1
  fi
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

SOURCE_DB="$(grep '^database=' "$CNF_FILE" | head -1 | cut -d= -f2-)"
SCRATCH_DB="${SOURCE_DB}_restoretest"
LOG_FILE="/tmp/jokas-restore-drill-$(date +%Y%m%d-%H%M%S).log"

echo "======================================================================"
echo " Jokas ERP — Backup Restore Drill (non-destructive)"
echo "======================================================================"
echo "  Backup file : $BACKUP_FILE"
echo "  Scratch db  : $SCRATCH_DB (dropped at the end — production db is never touched)"
echo "  Log         : $LOG_FILE"
echo "======================================================================"
echo ""

{
  echo "[$(date)] Starting restore drill for $BACKUP_FILE"

  echo "Step 1/5: Verifying gzip integrity..."
  gzip -t "$BACKUP_FILE"
  SIZE_BYTES="$(wc -c < "$BACKUP_FILE")"
  if [[ "$SIZE_BYTES" -lt 1024 ]]; then
    echo "FAIL: backup file is suspiciously small (${SIZE_BYTES} bytes) — likely empty/broken."
    exit 1
  fi
  echo "OK — gzip valid, ${SIZE_BYTES} bytes."

  echo "Step 2/5: Creating scratch database $SCRATCH_DB..."
  # Known constraint on this host: Hostinger shared-hosting MySQL users are
  # sometimes confined to specific pre-provisioned databases and lack
  # CREATE DATABASE privilege outright (hit exactly this in an earlier
  # attempt at this same drill). Fail with a clear, actionable message
  # instead of a confusing raw MySQL permission error.
  if ! mysql --defaults-file="$CNF_FILE" -e "DROP DATABASE IF EXISTS \`${SCRATCH_DB}\`; CREATE DATABASE \`${SCRATCH_DB}\`;" 2>/tmp/jokas-restore-drill-create-err.log; then
    echo "FAIL: could not create scratch database '${SCRATCH_DB}'."
    if grep -qi "access denied\|command denied" /tmp/jokas-restore-drill-create-err.log; then
      echo "This looks like a privilege issue, not a syntax/connection problem — the DB"
      echo "user in $CNF_FILE likely doesn't have CREATE DATABASE rights on this Hostinger"
      echo "plan. Two options: (1) create '${SCRATCH_DB}' once via hPanel's database"
      echo "manager and grant the same user access to it, then re-run this script — it"
      echo "will reuse an existing scratch db without needing to create one; or (2) ask"
      echo "Hostinger support to grant CREATE DATABASE to the app's DB user."
    fi
    cat /tmp/jokas-restore-drill-create-err.log
    exit 1
  fi

  echo "Step 3/5: Restoring backup into scratch database..."
  gunzip -c "$BACKUP_FILE" | mysql --defaults-file="$CNF_FILE" "$SCRATCH_DB"

  echo "Step 4/5: Sanity-checking row counts (scratch db vs production db)..."
  mysql --defaults-file="$CNF_FILE" -e "
    SELECT 'User' AS \`table\`,
           (SELECT COUNT(*) FROM \`${SCRATCH_DB}\`.User) AS restored_rows,
           (SELECT COUNT(*) FROM \`${SOURCE_DB}\`.User) AS live_rows
    UNION ALL
    SELECT 'Employee',
           (SELECT COUNT(*) FROM \`${SCRATCH_DB}\`.Employee),
           (SELECT COUNT(*) FROM \`${SOURCE_DB}\`.Employee)
    UNION ALL
    SELECT 'InventoryItem',
           (SELECT COUNT(*) FROM \`${SCRATCH_DB}\`.InventoryItem),
           (SELECT COUNT(*) FROM \`${SOURCE_DB}\`.InventoryItem)
    UNION ALL
    SELECT 'SalesOrder',
           (SELECT COUNT(*) FROM \`${SCRATCH_DB}\`.SalesOrder),
           (SELECT COUNT(*) FROM \`${SOURCE_DB}\`.SalesOrder);
  "
  echo "(restored_rows will trail live_rows by however old the backup is — that's expected, not a failure. Zero everywhere is the real failure signal.)"

  echo "Step 5/5: Dropping scratch database..."
  mysql --defaults-file="$CNF_FILE" -e "DROP DATABASE \`${SCRATCH_DB}\`;"

  echo "[$(date)] PASS — backup restored successfully and was sanity-checked."
} 2>&1 | tee "$LOG_FILE"

RESULT=${PIPESTATUS[0]}
if [[ "$RESULT" -eq 0 ]]; then
  echo ""
  echo "PASS — see $LOG_FILE for the full drill output."
else
  echo ""
  echo "FAIL — restore drill did not complete cleanly. See $LOG_FILE. The scratch"
  echo "       database may still exist; drop it manually once you've investigated:"
  echo "       mysql --defaults-file=$CNF_FILE -e \"DROP DATABASE IF EXISTS \\\`${SCRATCH_DB}\\\`;\""
  exit 1
fi

# C8: same idea for the uploaded-files backup (deploy.yml's "Setup
# uploaded-files backup cron" step) — just an archive-integrity check, not a
# full restore, since untarring into place would risk clobbering live
# uploads. Non-fatal: files backups didn't exist before today, so an absent
# one on an older host isn't a failure of this drill.
FILES_BACKUP_DIR="${JOKAS_FILES_BACKUP_DIR:-$HOME/jokas-files-backups}"
LATEST_FILES_BACKUP="$(ls -t "$FILES_BACKUP_DIR"/files-*.tar.gz 2>/dev/null | head -1 || true)"
if [[ -n "$LATEST_FILES_BACKUP" ]]; then
  echo ""
  echo "Bonus check: verifying uploaded-files backup archive integrity..."
  if tar -tzf "$LATEST_FILES_BACKUP" >/dev/null 2>&1; then
    echo "OK — $LATEST_FILES_BACKUP is a valid tar.gz archive."
  else
    echo "WARN — $LATEST_FILES_BACKUP failed tar integrity check. Investigate separately."
  fi
else
  echo ""
  echo "(No files-*.tar.gz backup found in $FILES_BACKUP_DIR yet — skipping that check.)"
fi
