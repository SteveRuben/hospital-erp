/**
 * Periodic audit chain verifier. Runs once 30 seconds after boot (so
 * a broken chain in prod surfaces in the first minute of the new
 * process) and then every N hours. On any break, the result is logged
 * loud, persisted to a dedicated audit entry (action='audit_verify'),
 * and emitted as a notification to every active admin.
 *
 * The interval is intentionally fixed in code rather than driven by a
 * setting — turning the verifier off would be the first thing a
 * sophisticated attacker does, so it must be configuration-immutable.
 */

import { verifyAuditChain } from './audit-verify.js';
import { prisma } from '../config/db.js';
import { notifyMany } from './notify.js';

const HOURS_BETWEEN_RUNS = 6;
const FIRST_RUN_DELAY_MS = 30_000;

async function runOnce(): Promise<void> {
  try {
    const result = await verifyAuditChain();
    if (result.ok) {
      console.log(`[AUDIT_VERIFY] ok — scanned ${result.scanned} rows in ${result.durationMs}ms`);
      return;
    }
    console.error(`[AUDIT_VERIFY] CHAIN BROKEN — scanned=${result.scanned} breaks=${result.breaks} issues:`);
    for (const i of result.issues) console.error('  ' + i);

    // Persist the alarm into the audit log itself so the break is
    // visible from the standard log surface. Yes — the broken-chain
    // alarm is also chained; that's by design.
    await prisma.auditLog.create({
      data: {
        action: 'access_denied',
        tableName: 'audit_log',
        details: `Audit chain integrity check FAILED: scanned=${result.scanned}, breaks=${result.breaks}, first issues: ${result.issues.slice(0, 5).join('; ')}`,
      },
    }).catch(err => console.error('[AUDIT_VERIFY] could not log break:', err));

    // Notify every active admin so somebody acts on it.
    const admins = await prisma.user.findMany({
      where: { role: 'admin', suspended: false },
      select: { id: true },
    });
    if (admins.length > 0) {
      await notifyMany(admins.map(a => a.id), {
        type: 'attribution_propose', // reuse existing type; details speak for themselves
        title: '⚠ Chaîne d\'audit corrompue',
        body: `${result.breaks} ruptures détectées sur ${result.scanned} lignes. À investiguer immédiatement.`,
        link: '/app/securite',
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[AUDIT_VERIFY] verifier crashed:', err);
  }
}

export function scheduleAuditVerify(): void {
  // First run shortly after boot — surfaces a pre-existing break in
  // the first minute of the new process so deploys can roll back
  // if the corruption predated this version.
  setTimeout(() => {
    runOnce().catch(err => console.error('[AUDIT_VERIFY] first run failed:', err));
  }, FIRST_RUN_DELAY_MS).unref();

  // Recurring run. unref() so the timer doesn't block process exit.
  setInterval(() => {
    runOnce().catch(err => console.error('[AUDIT_VERIFY] scheduled run failed:', err));
  }, HOURS_BETWEEN_RUNS * 3600_000).unref();

  console.log(`[AUDIT_VERIFY] scheduled — first run in ${FIRST_RUN_DELAY_MS / 1000}s, then every ${HOURS_BETWEEN_RUNS}h`);
}
