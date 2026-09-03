#!/usr/bin/env bash
# ============================================================================
# Jokas ERP — build + migrate + (re)start on the VPS
# ----------------------------------------------------------------------------
# Run as the `deploy` user from the repo root:
#     cd /opt/jokas/app && bash infra/vps/deploy.sh
#
# Safe to re-run. This is also what CI will call over SSH later.
# Prerequisites (first time only — see RUNBOOK.md):
#   - infra/vps/setup.sh has been run as root
#   - <repo>/.env exists and is filled in
#   - the database has been imported and migration history reconciled
# ============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHARED_UPLOADS="/opt/jokas/shared/uploads"
cd "$REPO_DIR"

log() { echo -e "\n\033[1;34m==>\033[0m $*"; }

[ -f .env ] || { echo "ERROR: $REPO_DIR/.env missing — copy infra/vps/.env.production.template"; exit 1; }

# ─── Audit C1: don't deploy code CI hasn't seen ───────────────────────────
# This box deploys by hand off `vps-migration`, which bypasses the GitHub
# quality gate. These checks make a blind deploy a deliberate act, not the
# default: the tree must be clean and HEAD must exist on the remote (so the
# `build` job — lint + typecheck + unit + e2e — has run on this exact commit).
# Set ALLOW_DIRTY_DEPLOY=1 to override for an emergency hotfix.
DEPLOY_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
DEPLOY_SHA="$(git rev-parse --short HEAD)"
log "Deploying $DEPLOY_BRANCH @ $DEPLOY_SHA"
if [ "${ALLOW_DIRTY_DEPLOY:-0}" != "1" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: working tree has uncommitted changes — commit or stash them, or set ALLOW_DIRTY_DEPLOY=1."
    git status --short
    exit 1
  fi
  git fetch --quiet origin "$DEPLOY_BRANCH" || true
  if ! git merge-base --is-ancestor HEAD "origin/$DEPLOY_BRANCH" 2>/dev/null; then
    echo "ERROR: HEAD ($DEPLOY_SHA) is not on origin/$DEPLOY_BRANCH — push it so CI runs on it first, or set ALLOW_DIRTY_DEPLOY=1."
    exit 1
  fi
fi

# NEXT_PUBLIC_* are inlined at build time — export them for `next build`.
set -a; . ./.env; set +a
export NODE_OPTIONS="--max-old-space-size=4096"

log "Install dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

log "Generate Prisma client"
pnpm --filter @jokas/db prisma:generate

log "Build shared + db + api"
pnpm --filter @jokas/shared build
pnpm --filter @jokas/db build
pnpm --filter @jokas/api build

# ─── Next.js builds ──────────────────────────────────────────────────────────
# `next build` deletes and recreates apps/<app>/.next/ at the start of a run
# that then takes 10-15 min on this box. PM2 must NOT serve straight out of
# apps/<app>/.next/ — during every build (and after any failed one) that
# directory is incomplete and the whole site 400s on every chunk.
#
# Instead PM2 serves from a stable release dir ($LIVE_DIR/<app>), and we only
# rsync the freshly built + verified standalone tree into it at the very end.
# The build can churn for 15 min or fail outright; the running site is
# untouched until the rsync + restart.  (ecosystem.config.js points PM2 at
# $LIVE_DIR — run `pm2 delete jokas-web jokas-storefront` once when adopting
# this so the new script path takes effect.)
LIVE_DIR="/opt/jokas/live"
mkdir -p "$LIVE_DIR"

# Clean build. Since PM2 now serves from $LIVE_DIR, apps/<app>/.next is purely
# a build scratch dir — and a killed/interrupted `next build` leaves partial
# JSON manifests there that make the next run crash with
# "SyntaxError: Unexpected end of JSON input" at "Collecting page data".
log "Clean Next.js build dirs"
rm -rf apps/web/.next apps/web/.next-new apps/storefront/.next apps/storefront/.next-new
rm -rf apps/web/node_modules/.cache apps/storefront/node_modules/.cache

log "Build web + storefront (Next.js) — the live site keeps running"
if ! ( pnpm --filter @jokas/web build && pnpm --filter @jokas/storefront build ); then
  echo -e "\n\033[1;31m==> Next.js build FAILED — the running site is untouched. Fix the error and re-run.\033[0m"
  exit 1
fi

log "Assemble standalone trees + verify"
for app in web storefront; do
  sa="apps/$app/.next/standalone/apps/$app"
  [ -f "$sa/server.js" ] || { echo "ERROR: $app build produced no server.js"; exit 1; }
  mkdir -p "$sa/.next"
  rm -rf "$sa/.next/static"
  cp -r "apps/$app/.next/static" "$sa/.next/static"
  [ -d "apps/$app/public" ] && { rm -rf "$sa/public"; cp -r "apps/$app/public" "$sa/public"; } || true
  if [ ! -d "$sa/.next/static/chunks" ] || [ ! -d "$sa/.next/static/css" ]; then
    echo "ERROR: $app assembled tree is missing .next/static/chunks or /css — not swapping."
    exit 1
  fi
  # @swc/helpers is a RUNTIME dep of Next's compiled output.
  root_sa="apps/$app/.next/standalone"
  if [ ! -d "$root_sa/node_modules/@swc/helpers" ]; then
    src=$(cd "apps/$app" && node -p "require('path').dirname(require.resolve('@swc/helpers/package.json'))" 2>/dev/null || true)
    if [ -n "${src:-}" ] && [ -d "$src" ]; then
      mkdir -p "$root_sa/node_modules/@swc/helpers"
      cp -r "$src/." "$root_sa/node_modules/@swc/helpers/"
      echo "[deploy] patched @swc/helpers into $app standalone"
    fi
  fi
done

log "Swap the verified build into the live release dir"
for app in web storefront; do
  mkdir -p "$LIVE_DIR/$app"
  # --delete so removed chunks don't linger; the whole standalone/ tree
  # (server.js + node_modules + .next/static + public) goes across.
  rsync -a --delete "apps/$app/.next/standalone/" "$LIVE_DIR/$app/"
done

# ─── Uploads: keep user files OUTSIDE the repo, symlink them in ─────────────
# UploadsController reads from `process.cwd()/uploads`, and PM2 runs the API
# with cwd = repo root — so the symlink that matters is <root>/uploads.
# apps/api/uploads is kept too (matches the dev/Hostinger layout).
log "Wire uploads directory"
mkdir -p "$SHARED_UPLOADS"
rm -rf uploads apps/api/uploads
ln -s "$SHARED_UPLOADS" uploads
ln -s "$SHARED_UPLOADS" apps/api/uploads

# ─── Database migrations ──────────────────────────────────────────────────
# On the VPS `prisma migrate deploy` works normally (the indefinite hang was
# Hostinger-shared-hosting-specific). Migration history must have been
# reconciled once first — see infra/vps/reconcile-migrations.sh / RUNBOOK.
log "Apply database migrations"
pnpm --filter @jokas/db exec prisma migrate deploy

# ─── (Re)start under PM2 ──────────────────────────────────────────────────
# Hard delete + start, not startOrReload: after a VPS reboot, PM2's
# systemd-resurrected process list can lose the real PIDs, so `reload`
# silently "restarts" a ghost while the real process keeps running stale
# code/env. delete+start guarantees the new build actually takes over.
# Also SIGKILL any orphaned app process the delete missed.
log "Restart PM2 processes (clean)"
pm2 delete jokas-api jokas-web jokas-storefront 2>/dev/null || true
pkill -f "apps/api/dist/main.js" 2>/dev/null || true
pkill -f "standalone/apps/web/server.js" 2>/dev/null || true
pkill -f "standalone/apps/storefront/server.js" 2>/dev/null || true
pkill -f "/opt/jokas/live/web/apps/web/server.js" 2>/dev/null || true
pkill -f "/opt/jokas/live/storefront/apps/storefront/server.js" 2>/dev/null || true
sleep 1
pm2 start infra/vps/ecosystem.config.js --update-env
pm2 save

log "Done. Status:"
pm2 status
echo
echo "Local health checks:"
curl -fsS -m 5 http://127.0.0.1:4001/health && echo "  api  OK" || echo "  api  FAIL"
curl -fsS -m 5 -o /dev/null -w "  web  HTTP %{http_code}\n"  http://127.0.0.1:3000/ || true
curl -fsS -m 5 -o /dev/null -w "  shop HTTP %{http_code}\n"  http://127.0.0.1:3002/shop || true
