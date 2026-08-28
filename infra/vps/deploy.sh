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

# NEXT_PUBLIC_* are inlined at build time — export them for `next build`.
set -a; . ./.env; set +a
export NODE_OPTIONS="--max-old-space-size=4096"

log "Install dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

log "Generate Prisma client"
pnpm --filter @jokas/db prisma:generate

log "Build shared + db + api + web + storefront"
pnpm --filter @jokas/shared build
pnpm --filter @jokas/db build
pnpm --filter @jokas/api build
pnpm --filter @jokas/web build
pnpm --filter @jokas/storefront build

# ─── Next.js standalone needs static/ + public/ copied in beside server.js ──
log "Assemble Next.js standalone trees"
for app in web storefront; do
  sa="apps/$app/.next/standalone/apps/$app"
  mkdir -p "$sa/.next"
  rm -rf "$sa/.next/static"
  cp -r "apps/$app/.next/static" "$sa/.next/static"
  [ -d "apps/$app/public" ] && { rm -rf "$sa/public"; cp -r "apps/$app/public" "$sa/public"; } || true

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
log "Wire uploads directory"
mkdir -p "$SHARED_UPLOADS"
rm -rf apps/api/uploads
ln -s "$SHARED_UPLOADS" apps/api/uploads

# ─── Database migrations ──────────────────────────────────────────────────
# On the VPS `prisma migrate deploy` works normally (the indefinite hang was
# Hostinger-shared-hosting-specific). Migration history must have been
# reconciled once first — see infra/vps/reconcile-migrations.sh / RUNBOOK.
log "Apply database migrations"
pnpm --filter @jokas/db exec prisma migrate deploy

# ─── (Re)start under PM2 ──────────────────────────────────────────────────
log "Reload PM2 processes"
pm2 startOrReload infra/vps/ecosystem.config.js --update-env
pm2 save

log "Done. Status:"
pm2 status
echo
echo "Local health checks:"
curl -fsS -m 5 http://127.0.0.1:4001/health && echo "  api  OK" || echo "  api  FAIL"
curl -fsS -m 5 -o /dev/null -w "  web  HTTP %{http_code}\n"  http://127.0.0.1:3000/ || true
curl -fsS -m 5 -o /dev/null -w "  shop HTTP %{http_code}\n"  http://127.0.0.1:3002/shop || true
