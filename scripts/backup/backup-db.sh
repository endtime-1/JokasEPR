#!/usr/bin/env bash
# Jokas ERP — PostgreSQL database backup
# Usage: backup-db.sh <output-file.dump>
# Produces a compressed pg_dump custom-format file that pg_restore can use.
set -euo pipefail

OUTPUT_FILE="${1:?Usage: backup-db.sh <output-file.dump>}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL environment variable is required}"

# Parse connection components from DATABASE_URL
# Supports: postgresql://user:pass@host:port/dbname[?params]
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

export PGPASSWORD="$DB_PASS"

echo "Connecting to ${DB_HOST}:${DB_PORT}/${DB_NAME} as ${DB_USER}..."

pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --format=custom \
  --compress=9 \
  --no-password \
  --verbose \
  --file="$OUTPUT_FILE"

unset PGPASSWORD

BACKUP_SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
echo "Database backup written to: ${OUTPUT_FILE} (${BACKUP_SIZE})"
