#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# backup.sh — Dump the PostgreSQL database and optionally archive uploads.
#
# Usage:
#   ./infra/scripts/backup.sh                   # dump DB only
#   ./infra/scripts/backup.sh --with-uploads    # dump DB + tar uploads volume
#   ./infra/scripts/backup.sh --prune 30        # delete backups older than 30 days
#
# Backups are written to ./backups/  (create with: mkdir -p backups)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Read DB credentials from env file
POSTGRES_USER=$(grep '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2 | tr -d '"')
POSTGRES_DB=$(grep '^POSTGRES_DB='   "$ENV_FILE" | cut -d= -f2 | tr -d '"')

# ── Database dump ─────────────────────────────────────────────────────────────
DUMP_FILE="$BACKUP_DIR/jokas_erp_${TIMESTAMP}.sql.gz"
echo "→ Dumping database to $DUMP_FILE ..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip -9 > "$DUMP_FILE"
echo "✓ Database backup: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

# ── Uploads archive ───────────────────────────────────────────────────────────
if [[ "${1:-}" == "--with-uploads" ]]; then
  UPLOADS_FILE="$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz"
  echo "→ Archiving uploads volume to $UPLOADS_FILE ..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm \
    -v uploads:/mnt/uploads:ro \
    --entrypoint tar \
    api czf - -C /mnt/uploads . \
    > "$UPLOADS_FILE"
  echo "✓ Uploads backup: $UPLOADS_FILE ($(du -h "$UPLOADS_FILE" | cut -f1))"
fi

# ── Prune old backups ─────────────────────────────────────────────────────────
if [[ "${1:-}" == "--prune" ]]; then
  DAYS="${2:-30}"
  echo "→ Removing backups older than $DAYS days..."
  find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$DAYS" -delete
  find "$BACKUP_DIR" -name "*.tar.gz" -mtime +"$DAYS" -delete
  echo "✓ Old backups pruned."
fi

echo ""
echo "Backup complete. Stored in: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -5
