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

echo "==> Restoring previous deploy (rsync)..."
rsync -a --delete "$PREV_DIR/" "$APP_DIR/"
echo "  Restore complete."

echo "==> Signalling Passenger restart..."
# (readiness review 2026-08-20) This used to pkill "apps/api/dist/main.js"
# first — a no-op today, since the API runs as a Worker thread inside
# start.js, not a separately spawned process with that cmdline (same fact
# noted in deploy.yml's "Restart application" step). touch restart.txt below
# is what actually recycles everything: Passenger tears down and relaunches
# the whole start.js process, taking every worker thread (web/storefront/
# API) with it.
mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"

echo ""
echo "Rollback complete. Wait 30 seconds then check https://jokasfarms.com"
echo "Load average now: $(cat /proc/loadavg)"
