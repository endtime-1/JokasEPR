#!/usr/bin/env bash
# ============================================================================
# Jokas ERP — nightly backup (DB dump + uploaded files), local retention.
# ----------------------------------------------------------------------------
# Install as a real cron job (the VPS HAS cron, unlike the old shared host):
#     crontab -e   # as the `deploy` user
#     15 2 * * *  /opt/jokas/app/infra/vps/backup.sh >> /opt/jokas/backups/backup.log 2>&1
#
# Keeps 14 daily copies. For off-site safety, add an `rclone copy` line at the
# end pointing at Backblaze B2 / Cloudflare R2 / Google Drive.
# ============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="/opt/jokas/backups"
UPLOADS_DIR="/opt/jokas/shared/uploads"
RETENTION_DAYS=14
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"
DATABASE_URL=$(grep '^DATABASE_URL=' "$REPO_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"')

_u="${DATABASE_URL#mysql://}"
DB_USER="${_u%%:*}"; _ap="${_u#*:}"
DB_PASS="${_ap%@*}"; _hp="${_ap##*@}"
DB_HOST="${_hp%%[:/*]*}"; _ah="${_hp#"$DB_HOST"}"
case "$_ah" in :*) DB_PORT="${_ah#:}"; DB_PORT="${DB_PORT%%/*}" ;; *) DB_PORT="3306" ;; esac
DB_NAME="${_hp#*/}"; DB_NAME="${DB_NAME%%[?#]*}"

umask 077
CNF=$(mktemp)
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' \
  "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASS" > "$CNF"
trap 'rm -f "$CNF"' EXIT

echo "[$(date -Is)] dumping database $DB_NAME"
mysqldump --defaults-file="$CNF" --single-transaction --routines --triggers \
  "$DB_NAME" | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"

echo "[$(date -Is)] archiving uploads"
tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"

echo "[$(date -Is)] pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name 'db-*.sql.gz'      -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +$RETENTION_DAYS -delete

echo "[$(date -Is)] done: $(du -sh "$BACKUP_DIR" | cut -f1) in $BACKUP_DIR"

# ── Off-site copy (uncomment after `rclone config`) ──────────────────────────
# rclone copy "$BACKUP_DIR/db-$STAMP.sql.gz"      remote:jokas-backups/ --no-traverse
# rclone copy "$BACKUP_DIR/uploads-$STAMP.tar.gz" remote:jokas-backups/ --no-traverse
