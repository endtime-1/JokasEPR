#!/usr/bin/env bash
# Jokas ERP — Uploaded files backup
# Usage: backup-files.sh <source-dir> <output-archive.tar.gz>
# Creates a compressed tar archive of the uploads directory.
set -euo pipefail

SOURCE_DIR="${1:?Usage: backup-files.sh <source-dir> <output-archive.tar.gz>}"
OUTPUT_FILE="${2:?Usage: backup-files.sh <source-dir> <output-archive.tar.gz>}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "WARNING: Upload directory does not exist: ${SOURCE_DIR} — skipping file backup."
  exit 0
fi

FILE_COUNT=$(find "$SOURCE_DIR" -type f | wc -l)
echo "Archiving ${FILE_COUNT} file(s) from: ${SOURCE_DIR}"

tar \
  --create \
  --gzip \
  --file="$OUTPUT_FILE" \
  --directory="$(dirname "$SOURCE_DIR")" \
  "$(basename "$SOURCE_DIR")"

ARCHIVE_SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
echo "File archive written to: ${OUTPUT_FILE} (${ARCHIVE_SIZE})"
