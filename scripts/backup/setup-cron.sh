#!/usr/bin/env bash
# Jokas ERP — Cron job installer for automated backups
#
# Installs three cron jobs:
#   • Daily backup   — every day at 02:00
#   • Weekly backup  — every Sunday at 03:00
#   • Monthly backup — 1st of every month at 04:00
#
# Usage:
#   ./setup-cron.sh           — install/update cron jobs
#   ./setup-cron.sh --remove  — remove all Jokas backup cron jobs
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SH="${SCRIPT_DIR}/backup.sh"
LOG_DIR="${BACKUP_ROOT:-/opt/jokas/backups}/logs"

if [[ ! -f "$BACKUP_SH" ]]; then
  echo "ERROR: backup.sh not found at ${BACKUP_SH}"
  exit 1
fi

chmod +x "${SCRIPT_DIR}"/*.sh

CRON_TAG="# jokas-erp-backup"
DAILY_JOB="0 2 * * *   ${BACKUP_SH} daily  >> ${LOG_DIR}/cron.log 2>&1  ${CRON_TAG}"
WEEKLY_JOB="0 3 * * 0  ${BACKUP_SH} weekly >> ${LOG_DIR}/cron.log 2>&1  ${CRON_TAG}"
MONTHLY_JOB="0 4 1 * * ${BACKUP_SH} monthly >> ${LOG_DIR}/cron.log 2>&1 ${CRON_TAG}"

mkdir -p "$LOG_DIR"

if [[ "${1:-}" == "--remove" ]]; then
  echo "Removing Jokas ERP backup cron jobs..."
  crontab -l 2>/dev/null | grep -v "$CRON_TAG" | crontab -
  echo "Done. Remaining crontab:"
  crontab -l 2>/dev/null || echo "(empty)"
  exit 0
fi

echo "Installing Jokas ERP backup cron jobs..."

# Remove old entries first, then add fresh
(
  crontab -l 2>/dev/null | grep -v "$CRON_TAG"
  echo "$DAILY_JOB"
  echo "$WEEKLY_JOB"
  echo "$MONTHLY_JOB"
) | crontab -

echo ""
echo "Installed cron jobs:"
crontab -l | grep "$CRON_TAG"
echo ""
echo "Schedule:"
echo "  Daily   — every day at 02:00 AM"
echo "  Weekly  — every Sunday at 03:00 AM"
echo "  Monthly — 1st of every month at 04:00 AM"
echo ""
echo "Logs: ${LOG_DIR}/cron.log"
echo ""
echo "Test now with:"
echo "  ${BACKUP_SH} daily"
