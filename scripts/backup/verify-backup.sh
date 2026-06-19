#!/usr/bin/env bash
# Jokas ERP — Backup integrity verification
#
# Usage:
#   ./verify-backup.sh <backup-directory>
#   ./verify-backup.sh /opt/jokas/backups/daily/jokas_daily_20260616_020001
#
# Checks: manifest exists, pg_restore can list objects, file archives unpack,
#         and performs a dry-run restore to a temporary database.
set -euo pipefail

BACKUP_DIR="${1:?Usage: verify-backup.sh <backup-directory>}"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "ERROR: Backup directory not found: ${BACKUP_DIR}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/backup.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

DATABASE_URL="${DATABASE_URL:?DATABASE_URL environment variable is required}"

PASS=0
FAIL=0

ok()   { echo "  ✓ $*"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $*"; FAIL=$((FAIL + 1)); }
section() { echo ""; echo "── $* ──"; }

echo "======================================================================"
echo " Jokas ERP — Backup Verification"
echo " Directory: ${BACKUP_DIR}"
echo "======================================================================"

# ─── manifest ─────────────────────────────────────────────────────────────────
section "Manifest"
MANIFEST="${BACKUP_DIR}/manifest.json"
if [[ -f "$MANIFEST" ]]; then
  ok "manifest.json present"
  if command -v jq &>/dev/null; then
    TS=$(jq -r '.timestamp' "$MANIFEST" 2>/dev/null || echo "parse error")
    TYPE=$(jq -r '.type' "$MANIFEST" 2>/dev/null || echo "unknown")
    ok "Type: ${TYPE}  Timestamp: ${TS}"
  fi
else
  fail "manifest.json missing"
fi

# ─── database dump ────────────────────────────────────────────────────────────
section "Database Dump"
DB_DUMP="${BACKUP_DIR}/database.dump"
if [[ -f "$DB_DUMP" ]]; then
  DUMP_SIZE=$(du -sh "$DB_DUMP" | cut -f1)
  ok "database.dump present (${DUMP_SIZE})"

  OBJECT_COUNT=$(pg_restore --list "$DB_DUMP" 2>/dev/null | wc -l)
  if [[ "$OBJECT_COUNT" -gt 0 ]]; then
    ok "pg_restore can read dump: ${OBJECT_COUNT} objects listed"
  else
    fail "pg_restore could not read dump (0 objects — possibly corrupt)"
  fi
else
  fail "database.dump not found"
fi

# ─── file archive ─────────────────────────────────────────────────────────────
section "File Archive"
UPLOADS_ARCHIVE="${BACKUP_DIR}/uploads.tar.gz"
if [[ -f "$UPLOADS_ARCHIVE" ]]; then
  ARCHIVE_SIZE=$(du -sh "$UPLOADS_ARCHIVE" | cut -f1)
  ok "uploads.tar.gz present (${ARCHIVE_SIZE})"

  if tar --test-label --file="$UPLOADS_ARCHIVE" 2>/dev/null || \
     tar -tzf "$UPLOADS_ARCHIVE" > /dev/null 2>&1; then
    FILE_COUNT=$(tar -tzf "$UPLOADS_ARCHIVE" 2>/dev/null | wc -l)
    ok "Archive is readable: ${FILE_COUNT} entries"
  else
    fail "Archive is corrupt or unreadable"
  fi
else
  ok "No uploads.tar.gz (optional — skipped)"
fi

# ─── dry-run restore ──────────────────────────────────────────────────────────
section "Dry-Run Restore (temp database)"
if [[ -f "$DB_DUMP" ]]; then
  # Parse DATABASE_URL
  strip_scheme() { echo "${1#postgresql://}"; }
  REMAINDER="$(strip_scheme "$DATABASE_URL")"
  USERINFO="${REMAINDER%%@*}"
  REMAINDER="${REMAINDER#*@}"
  DB_HOST="${REMAINDER%%:*}"
  REMAINDER="${REMAINDER#*:}"
  DB_PORT="${REMAINDER%%/*}"
  DB_USER="${USERINFO%%:*}"
  DB_PASS="${USERINFO#*:}"
  export PGPASSWORD="$DB_PASS"

  TEMP_DB="jokas_verify_$(date +%s)"
  PSQL="psql --host=${DB_HOST} --port=${DB_PORT} --username=${DB_USER} --no-password"

  echo "  Creating temporary database: ${TEMP_DB}..."
  $PSQL --dbname=postgres --command "CREATE DATABASE \"${TEMP_DB}\" OWNER \"${DB_USER}\";" 2>/dev/null

  RESTORE_OK=true
  pg_restore \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$TEMP_DB" \
    --no-password \
    "$DB_DUMP" > /dev/null 2>&1 || RESTORE_OK=false

  if $RESTORE_OK; then
    TABLE_COUNT=$($PSQL --dbname="$TEMP_DB" --tuples-only \
      --command "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" \
      2>/dev/null | tr -d ' ')
    ok "Dry-run restore succeeded: ${TABLE_COUNT} tables in temp database"
  else
    fail "Dry-run restore failed — backup may be partially corrupt"
  fi

  $PSQL --dbname=postgres --command "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" 2>/dev/null
  unset PGPASSWORD
else
  echo "  Skipped (no database.dump)"
fi

# ─── summary ──────────────────────────────────────────────────────────────────
echo ""
echo "======================================================================"
echo " Verification complete: ${PASS} passed, ${FAIL} failed"
echo "======================================================================"

if [[ $FAIL -gt 0 ]]; then
  echo " ⚠  This backup has issues. Do not rely on it for recovery."
  exit 1
else
  echo " ✓  Backup is valid and restorable."
  exit 0
fi
