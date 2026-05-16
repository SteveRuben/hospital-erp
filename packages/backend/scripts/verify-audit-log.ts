/**
 * Verify the audit_log hash chain.
 *
 * Walks the table in id order and recomputes each row's hash from its
 * content + the previous row's hash. Reports any row whose stored hash
 * doesn't match — that row, or one before it, has been tampered with.
 *
 * Run periodically (cron, CI, on-demand after suspicious activity):
 *   cd packages/backend && npx tsx scripts/verify-audit-log.ts
 *
 * Exit codes:
 *   0  chain is intact
 *   1  chain broken (details on stderr)
 *   2  unexpected error
 */

import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/config/db.js';

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

function formatTimestamp(d: Date): string {
  // PostgreSQL TIMESTAMP::text default form is `YYYY-MM-DD HH:MM:SS.ffffff`
  // (no T, no Z). Mirror that so digest input matches the DB trigger.
  const iso = d.toISOString(); // 2026-05-16T12:34:56.789Z
  return iso.replace('T', ' ').replace('Z', '').replace(/\.(\d{3})$/, '.$1000');
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

async function main() {
  let afterId = 0;
  let prevHash: string | null = null;
  let scanned = 0;
  let breaks = 0;
  const issues: string[] = [];

  console.log('[VERIFY] walking audit_log chain…');

  for (;;) {
    const rows = await fetchBatch(afterId);
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned++;
      if (row.hash === null) {
        // Pre-trigger rows from before the chain was enabled — skip silently.
        continue;
      }
      if (row.prevHash !== prevHash) {
        breaks++;
        issues.push(`row #${row.id}: stored prev_hash=${row.prevHash?.slice(0, 8) ?? 'null'}… but actual previous hash=${prevHash?.slice(0, 8) ?? 'null'}…`);
      }
      const recomputed = computeHash(row);
      if (recomputed !== row.hash) {
        breaks++;
        issues.push(`row #${row.id}: stored hash=${row.hash.slice(0, 8)}… but recomputed=${recomputed.slice(0, 8)}…`);
      }
      prevHash = row.hash;
    }

    afterId = rows[rows.length - 1].id;
    if (scanned % 5000 === 0) console.log(`[VERIFY] scanned=${scanned} breaks=${breaks}`);
  }

  console.log(`[VERIFY] done. scanned=${scanned} breaks=${breaks}`);
  if (breaks > 0) {
    console.error('[VERIFY] CHAIN BROKEN. Issues:');
    for (const issue of issues.slice(0, 50)) console.error('  ' + issue);
    if (issues.length > 50) console.error(`  …and ${issues.length - 50} more`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('[VERIFY] chain intact ✓');
  await prisma.$disconnect();
  process.exit(0);
}

// keep the Prisma type import alive for tsc even though we don't reference it directly
void Prisma;

main().catch(async err => {
  console.error('[VERIFY] unexpected error:', err);
  await prisma.$disconnect();
  process.exit(2);
});
