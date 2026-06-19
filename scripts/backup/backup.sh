#!/usr/bin/env bash
# Jokas ERP — Full backup: database + uploaded files
#
# Usage:
#   ./backup.sh              — daily backup (default)
#   ./backup.sh daily        — daily backup
#   ./backup.sh weekly       — weekly backup
#   ./backup.sh monthly      — monthly backup
#
# Requirements: pg_dump, tar, gzip, aws-cli (optional for S3)
# Setup:  cp backup.env.example backup.env  && fill in values
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/backup.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: ${ENV_FILE} not found."
  echo "       Copy backup.env.example to backup.env and fill in your values."
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

BACKUP_TYPE="${1:-daily}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_NAME="jokas_${BACKUP_TYPE}_${TIMESTAMP}"
BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_TYPE}/${BACKUP_NAME}"
LOG_DIR="${BACKUP_ROOT}/logs"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"
LOG_FILE="${LOG_DIR}/backup_${TIMESTAMP}.log"

# ─── helpers ──────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
die() { log "FATAL: $*"; notify_failure "$*"; exit 1; }

notify_failure() {
  local msg="$1"
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST "$SLACK_WEBHOOK_URL" \
      -H 'Content-type: application/json' \
      --data "{\"text\":\"❌ Jokas ERP backup FAILED (${BACKUP_TYPE} ${TIMESTAMP}): ${msg}\"}" || true
  fi
  if [[ -n "${ALERT_EMAIL:-}" ]]; then
    echo "Jokas ERP ${BACKUP_TYPE} backup failed at ${TIMESTAMP}: ${msg}" \
      | mail -s "[JOKAS] Backup failure" "$ALERT_EMAIL" 2>/dev/null || true
  fi
}

# ─── start ────────────────────────────────────────────────────────────────────
log "======================================================================"
log " Jokas ERP Backup — ${BACKUP_TYPE} — ${TIMESTAMP}"
log "======================================================================"
log "Destination: ${BACKUP_DIR}"

# ─── database ─────────────────────────────────────────────────────────────────
log "Step 1/4: Backing up PostgreSQL database..."
"${SCRIPT_DIR}/backup-db.sh" "${BACKUP_DIR}/database.dump" 2>&1 | tee -a "$LOG_FILE" \
  || die "Database backup failed"
DB_SIZE=$(du -sh "${BACKUP_DIR}/database.dump" | cut -f1)
log "Database backup OK: ${DB_SIZE}"

# ─── files ────────────────────────────────────────────────────────────────────
log "Step 2/4: Backing up uploaded files..."
UPLOAD_DIR="${APP_UPLOAD_DIR:-}"
if [[ -n "$UPLOAD_DIR" && -d "$UPLOAD_DIR" ]]; then
  "${SCRIPT_DIR}/backup-files.sh" "$UPLOAD_DIR" "${BACKUP_DIR}/uploads.tar.gz" \
    2>&1 | tee -a "$LOG_FILE" || die "File backup failed"
  FILES_SIZE=$(du -sh "${BACKUP_DIR}/uploads.tar.gz" | cut -f1)
  log "File backup OK: ${FILES_SIZE}"
else
  log "No upload directory configured or found — skipping file backup."
fi

# ─── manifest ─────────────────────────────────────────────────────────────────
log "Step 3/4: Writing manifest..."
FILES_JSON=$(find "$BACKUP_DIR" -maxdepth 1 -type f ! -name "manifest.json" \
  -exec basename {} \; | sort | sed 's/^/    "/;s/$/"/' | paste -sd ',' | sed 's/,/,\n/g')
cat > "${BACKUP_DIR}/manifest.json" <<MANIFEST
{
  "name": "${BACKUP_NAME}",
  "type": "${BACKUP_TYPE}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname -f 2>/dev/null || hostname)",
  "database_url_host": "${DATABASE_URL%%:*}",
  "files": [
${FILES_JSON}
  ]
}
MANIFEST
log "Manifest written."

# ─── cloud upload ─────────────────────────────────────────────────────────────
log "Step 4/4: Cloud upload..."
if [[ -n "${S3_BUCKET:-}" ]]; then
  S3_PATH="s3://${S3_BUCKET}/${S3_PREFIX:-jokas-erp-backups}/${BACKUP_NAME}/"
  log "Uploading to ${S3_PATH}..."
  aws s3 cp "${BACKUP_DIR}/" "$S3_PATH" \
    --recursive \
    --sse AES256 \
    2>&1 | tee -a "$LOG_FILE" || die "S3 upload failed"
  log "S3 upload OK → ${S3_PATH}"
else
  log "S3_BUCKET not configured — skipping cloud upload."
  log "IMPORTANT: Copy ${BACKUP_DIR} to off-site storage manually."
fi

# ─── retention ────────────────────────────────────────────────────────────────
"${SCRIPT_DIR}/apply-retention.sh" "$BACKUP_TYPE" 2>&1 | tee -a "$LOG_FILE"

# ─── summary ──────────────────────────────────────────────────────────────────
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "======================================================================"
log " Backup COMPLETE — ${TOTAL_SIZE} written to ${BACKUP_DIR}"
log "======================================================================"

if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
  curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-type: application/json' \
    --data "{\"text\":\"✅ Jokas ERP ${BACKUP_TYPE} backup completed — ${TIMESTAMP} (${TOTAL_SIZE})\"}" || true
fi
