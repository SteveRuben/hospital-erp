#!/usr/bin/env bash
# Hospital-ERP — Postgres backup script.
#
# Produces a custom-format pg_dump (.dump) which is the format
# pg_restore needs for selective recovery. Includes schema + data +
# blob references but NOT the uploads/ directory — that's a separate
# concern (see backup-uploads.sh).
#
# Usage:
#   DATABASE_URL=postgres://… ./scripts/backup.sh [output-dir]
#   ./scripts/backup.sh ./backups
#
# By default the dump lands at ./backups/hospital-erp-<UTC-timestamp>.dump.
# The script preserves the previous 14 days of dumps and prunes older
# files so the directory doesn't grow without bound.
#
# Recommended cron: every 6 hours.
#   0 */6 * * *  cd /app && ./scripts/backup.sh /var/backups/hospital >> /var/log/hospital-backup.log 2>&1
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required (postgres://user:pw@host:port/dbname)" >&2
  exit 2
fi

OUTPUT_DIR="${1:-./backups}"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_FILE="$OUTPUT_DIR/hospital-erp-${TIMESTAMP}.dump"

echo "[BACKUP] $(date -u) — dumping to $OUTPUT_FILE"
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner --no-acl \
  --verbose \
  --file="$OUTPUT_FILE" 2>&1 | tail -20

# Atomic sentinel — readers know the dump is complete only when the
# matching .ok file exists. Prevents pg_restore from being fed a
# half-written file if a copy job runs concurrently.
touch "${OUTPUT_FILE}.ok"

SIZE="$(du -h "$OUTPUT_FILE" | cut -f1)"
echo "[BACKUP] $(date -u) — done. size=$SIZE"

# Retention: keep 14 days of .dump + .ok pairs.
find "$OUTPUT_DIR" -name "hospital-erp-*.dump"    -mtime +14 -delete
find "$OUTPUT_DIR" -name "hospital-erp-*.dump.ok" -mtime +14 -delete
