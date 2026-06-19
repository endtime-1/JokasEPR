#!/usr/bin/env bash
# Jokas ERP — Backup retention enforcement
# Usage: apply-retention.sh <daily|weekly|monthly>
# Deletes backup directories older than the configured retention period.
set -euo pipefail

BACKUP_TYPE="${1:?Usage: apply-retention.sh <daily|weekly|monthly>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "${SCRIPT_DIR}/backup.env" ]]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/backup.env"
fi

BACKUP_ROOT="${BACKUP_ROOT:?BACKUP_ROOT is not set}"
RETAIN_DAILY="${RETAIN_DAILY:-7}"
RETAIN_WEEKLY="${RETAIN_WEEKLY:-30}"
RETAIN_MONTHLY="${RETAIN_MONTHLY:-365}"

case "$BACKUP_TYPE" in
  daily)   RETAIN_DAYS="$RETAIN_DAILY"   ;;
  weekly)  RETAIN_DAYS="$RETAIN_WEEKLY"  ;;
  monthly) RETAIN_DAYS="$RETAIN_MONTHLY" ;;
  *)
    echo "ERROR: Unknown backup type '${BACKUP_TYPE}'. Use daily, weekly, or monthly."
    exit 1
    ;;
esac

TARGET_DIR="${BACKUP_ROOT}/${BACKUP_TYPE}"

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Retention: directory ${TARGET_DIR} does not exist — nothing to prune."
  exit 0
fi

echo "Retention policy: keeping ${BACKUP_TYPE} backups for ${RETAIN_DAYS} day(s)."

DELETED=0
while IFS= read -r -d '' DIR; do
  echo "  Removing expired backup: $(basename "$DIR")"
  rm -rf "$DIR"
  DELETED=$((DELETED + 1))
done < <(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETAIN_DAYS" -print0)

if [[ $DELETED -eq 0 ]]; then
  echo "Retention: no expired backups found."
else
  echo "Retention: removed ${DELETED} expired backup(s)."
fi

REMAINING=$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
DISK_USED=$(du -sh "$TARGET_DIR" 2>/dev/null | cut -f1 || echo "unknown")
echo "Retention: ${REMAINING} backup(s) remaining, ${DISK_USED} disk used."
