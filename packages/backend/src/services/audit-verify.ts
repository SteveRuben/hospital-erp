/**
 * In-process audit chain verifier — reusable across the boot-time
 * background check, the scheduled hourly run, and the on-demand
 * admin endpoint.
 *
 * Same algorithm as scripts/verify-audit-log.ts (kept for ops use)
 * but lifted into a function so it can be wired into the app process.
 * The CEO review flagged it as P1-S4: the chain is computed by the DB
 * trigger but nothing ever audits the audit. This module closes the
 * loop.
 */

import crypto from 'crypto';
import { prisma } from '../config/db.js';

const BATCH = 1000;

interface AuditRow {
  id: number;
  userId: number | null;
  action: string | null;
  tableName: string | null;
  recordId: number | null;
  details: string | null;
  createdAt: Date;
  hash: string | null;
  prevHash: string | null;
}

export interface VerifyResult {
  ok: boolean;
  scanned: number;
  breaks: number;
  // First 20 broken row descriptions — enough to start an investigation
  // without trashing the response when the whole table is corrupted.
  issues: string[];
  durationMs: number;
  lastVerifiedId: number;
}

// Must match the DB trigger's to_char(created_at, 'YYYY-MM-DD HH24:MI:SS.MS').
// Prisma hands us created_at as a JS Date (millisecond precision); toISOString
// always emits 3-digit milliseconds, which lines up with Postgres '.MS'.
// Do NOT pad to microseconds — the trigger only hashes millisecond precision.
function formatTimestamp(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function computeHash(row: AuditRow): string {
  const payload = [
    row.userId === null ? '' : String(row.userId),
    row.action ?? '',
    row.tableName ?? '',
    row.recordId === null ? '' : String(row.recordId),
    row.details ?? '',
    formatTimestamp(row.createdAt),
    row.prevHash ?? '',
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function fetchBatch(afterId: number): Promise<AuditRow[]> {
  return prisma.$queryRaw<AuditRow[]>`
    SELECT id, user_id as "userId", action, table_name as "tableName",
           record_id as "recordId", details, created_at as "createdAt",
           hash, prev_hash as "prevHash"
      FROM audit_log
      WHERE id > ${afterId}
      ORDER BY id ASC
      LIMIT ${BATCH}
  `;
}

/**
 * The hash chain lives in two columns (hash / prev_hash) added by both a
 * Prisma migration and init.ts. On a database where neither has run yet
 * (fresh boot before the ALTER TABLE, or a partial deploy), the verifier
 * query references columns that don't exist and Postgres raises 42703.
 * We probe information_schema first so a missing-column situation is a
 * clean "skip" instead of a crash that the scheduler logs every 6h.
 */
async function hashColumnsExist(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*)::bigint AS cnt
      FROM information_schema.columns
     WHERE table_name = 'audit_log'
       AND column_name IN ('hash', 'prev_hash')
  `;
  return Number(rows[0]?.cnt ?? 0) >= 2;
}

/**
 * Walk the entire audit_log and verify the hash chain.
 *
 * Returns immediately on the first batch if the table is small.
 * Designed to be cheap to run every hour on a healthy chain (just
 * one SHA256 per row, no writes).
 */
export async function verifyAuditChain(): Promise<VerifyResult> {
  const t0 = Date.now();

  // Guard: the hash chain lives in two columns (hash / prev_hash) added by
  // both a Prisma migration and init.ts. On a database where neither has run
  // yet (fresh boot before the ALTER TABLE, or a partial deploy), the verifier
  // query references columns that don't exist and Postgres raises 42703. We
  // probe information_schema first so a missing-column situation is a clean
  // "skip" instead of a crash the scheduler logs loudly every 6h.
  if (!(await hashColumnsExist())) {
    return {
      ok: true, scanned: 0, breaks: 0,
      issues: ['hash/prev_hash columns absent — chain not initialised yet, skipping'],
      durationMs: Date.now() - t0, lastVerifiedId: 0,
    };
  }

  let afterId = 0;
  let prevHash: string | null = null;
  let scanned = 0;
  let breaks = 0;
  const issues: string[] = [];
  let lastVerifiedId = 0;

  for (;;) {
    const rows = await fetchBatch(afterId);
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned++;
      if (row.hash === null) continue; // pre-trigger row, skip silently
      if (row.prevHash !== prevHash) {
        breaks++;
        if (issues.length < 20) {
          issues.push(`row #${row.id}: stored prev_hash=${row.prevHash?.slice(0, 8) ?? 'null'}… but expected=${prevHash?.slice(0, 8) ?? 'null'}…`);
        }
      }
      const recomputed = computeHash(row);
      if (recomputed !== row.hash) {
        breaks++;
        if (issues.length < 20) {
          issues.push(`row #${row.id}: stored hash=${row.hash.slice(0, 8)}… recomputed=${recomputed.slice(0, 8)}…`);
        }
      }
      prevHash = row.hash;
      lastVerifiedId = row.id;
    }
    afterId = rows[rows.length - 1].id;
  }

  return { ok: breaks === 0, scanned, breaks, issues, durationMs: Date.now() - t0, lastVerifiedId };
}
