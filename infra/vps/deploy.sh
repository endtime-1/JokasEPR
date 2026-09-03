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

# ─── Next.js builds — snapshot / restore so a failed rebuild can't break the
#     site that's currently running ───────────────────────────────────────────
# `next build` regenerates apps/<app>/.next/ (including .next/standalone/,
# minus the static/ + public/ we copy in below) BEFORE it fails on a lint or
# type error. The running PM2 process reads its assets straight off that
# directory, so a failed rebuild used to leave every page throwing
# "Loading chunk failed" even though PM2 was never restarted. Snapshot the
# last-good trees first; on any failure in this section, put them back.
NEXT_SNAPSHOT="/opt/jokas/shared/last-good-next"
snapshot_next() {
  rm -rf "$NEXT_SNAPSHOT"; mkdir -p "$NEXT_SNAPSHOT"
  for a in web storefront; do
    if [ -d "apps/$a/.next/standalone" ]; then
      mkdir -p "$NEXT_SNAPSHOT/$a"
      cp -a "apps/$a/.next/standalone" "$NEXT_SNAPSHOT/$a/standalone"
      [ -d "apps/$a/.next/static" ] && cp -a "apps/$a/.next/static" "$NEXT_SNAPSHOT/$a/static"
    fi
  done
}
restore_next() {
  echo -e "\n\033[1;31m==> Next.js build FAILED — restoring the previous build so the site stays up\033[0m"
  for a in web storefront; do
    if [ -d "$NEXT_SNAPSHOT/$a/standalone" ]; then
      rm -rf "apps/$a/.next/standalone"; cp -a "$NEXT_SNAPSHOT/$a/standalone" "apps/$a/.next/standalone"
      [ -d "$NEXT_SNAPSHOT/$a/static" ] && { rm -rf "apps/$a/.next/static"; cp -a "$NEXT_SNAPSHOT/$a/static" "apps/$a/.next/static"; }
    fi
  done
  echo "==> Old build restored. Fix the error and re-run deploy.sh."
}

snapshot_next
log "Build web + storefront (Next.js)"
if ! ( pnpm --filter @jokas/web build && pnpm --filter @jokas/storefront build ); then
  restore_next
  exit 1
fi

# ─── Next.js standalone needs static/ + public/ copied in beside server.js ──
log "Assemble Next.js standalone trees"
for app in web storefront; do
  sa="apps/$app/.next/standalone/apps/$app"
  mkdir -p "$sa/.next"
  rm -rf "$sa/.next/static"
  cp -r "apps/$app/.next/static" "$sa/.next/static"
  [ -d "apps/$app/public" ] && { rm -rf "$sa/public"; cp -r "apps/$app/public" "$sa/public"; } || true

  # Refuse to go further if the assembled tree is missing the files the
  # running server serves — restarting into this state is what produced the
  # site-wide "Loading chunk failed" errors.
  if [ ! -f "$sa/server.js" ] || [ ! -d "$sa/.next/static/chunks" ]; then
    echo "ERROR: $app standalone tree is incomplete (server.js or .next/static/chunks missing) — aborting before restart."
    restore_next
    exit 1
  fi

  # Safety net: @swc/helpers is a RUNTIME dep of Next's compiled output. If the
  # standalone file-trace still missed it, copy the exact version Next resolves.
  root_sa="apps/$app/.next/standalone"
  if [ ! -d "$root_sa/node_modules/@swc/helpers" ]; then
    src=$(cd "apps/$app" && node -p "require('path').dirname(require.resolve('@swc/helpers/package.json'))" 2>/dev/null || true)
    if [ -n "${src:-}" ] && [ -d "$src" ]; then
      mkdir -p "$root_sa/node_modules/@swc/helpers"
      cp -r "$src/." "$root_sa/node_modules/@swc/helpers/"
      echo "[deploy] patched @swc/helpers into $app standalone (from $src)"
    fi
  fi
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
pkill -f ".next/standalone/apps/web/server.js" 2>/dev/null || true
pkill -f ".next/standalone/apps/storefront/server.js" 2>/dev/null || true
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
