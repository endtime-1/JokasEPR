#!/bin/bash
# Emergency rollback — restores the last good deploy from the nodejs_prev backup.
# Run this via SSH if a bad deployment breaks the site:
#
#   ssh -p 65002 u136486538@<host> 'bash -s' < scripts/rollback.sh
#
set -e

APP_DIR=~/domains/jokasfarms.com/nodejs
PREV_DIR="$APP_DIR/../nodejs_prev"

if [ ! -d "$PREV_DIR" ]; then
  echo "ERROR: No backup found at $PREV_DIR — cannot roll back."
  exit 1
fi

echo "==> Killing current API processes..."
pkill -f "apps/api/dist/main.js" 2>/dev/null && echo "  Processes killed." || echo "  None running."
sleep 3

echo "==> Restoring previous deploy (rsync)..."
rsync -a --delete "$PREV_DIR/" "$APP_DIR/"
echo "  Restore complete."

echo "==> Signalling Passenger restart..."
mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"

echo ""
echo "Rollback complete. Wait 30 seconds then check https://jokasfarms.com"
echo "Load average now: $(cat /proc/loadavg)"
