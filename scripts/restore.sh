#!/usr/bin/env bash
# Hospital-ERP — Postgres restore script.
#
# RECOVERS a backup file produced by backup.sh into the configured
# DATABASE_URL. The target database is DROPPED and RECREATED — this
# script is for incident recovery, not for merging data.
#
# Usage:
#   DATABASE_URL=postgres://… ./scripts/restore.sh <path/to/file.dump>
#
# Safety: requires the env var I_UNDERSTAND_THIS_DROPS_THE_DB=YES to
# proceed, so a typo or accidental run can't take down prod silently.
#
# After restore: run the app once (or `npx prisma migrate deploy`
# against the new state) to confirm schema is intact, then sanity-check
# row counts (patients, audit_log, users) against the source.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required" >&2
  exit 2
fi

DUMP_FILE="${1:-}"
if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: usage: $0 <path/to/backup.dump>" >&2
  exit 2
fi

if [[ ! -f "${DUMP_FILE}.ok" ]]; then
  echo "ERROR: ${DUMP_FILE}.ok sentinel missing — backup may be incomplete." >&2
  echo "       Re-run backup.sh or remove this guard if you know what you are doing." >&2
  exit 2
fi

if [[ "${I_UNDERSTAND_THIS_DROPS_THE_DB:-}" != "YES" ]]; then
  echo "ERROR: this script DROPS the target database before restoring." >&2
  echo "       Re-run with I_UNDERSTAND_THIS_DROPS_THE_DB=YES to proceed." >&2
  exit 2
fi

echo "[RESTORE] $(date -u) — target: $DATABASE_URL"
echo "[RESTORE] $(date -u) — source: $DUMP_FILE"
echo "[RESTORE] $(date -u) — dropping & recreating public schema…"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL

echo "[RESTORE] $(date -u) — running pg_restore…"
pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner --no-acl \
  --verbose \
  "$DUMP_FILE" 2>&1 | tail -20

echo "[RESTORE] $(date -u) — done."
echo "[RESTORE] Sanity check:"
psql "$DATABASE_URL" -At -c "SELECT 'patients=' || COUNT(*) FROM patients;"  2>/dev/null || true
psql "$DATABASE_URL" -At -c "SELECT 'users=' || COUNT(*) FROM users;"        2>/dev/null || true
psql "$DATABASE_URL" -At -c "SELECT 'audit_log=' || COUNT(*) FROM audit_log;" 2>/dev/null || true
echo "[RESTORE] Done. Now restart the app process."
