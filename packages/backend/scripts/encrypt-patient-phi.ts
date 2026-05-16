/**
 * One-shot backfill: encrypt existing patient PHI rows.
 *
 * OWASP A02 — required step after Lane B enables encryption in routes/patients.ts.
 * Without this, existing rows remain plaintext and only new writes are encrypted.
 *
 * Idempotent: skips rows whose target fields already look encrypted
 * (the iv:authTag:ciphertext base64 triplet).
 *
 * Usage:
 *   1. Set PHI_ENCRYPTION_KEY (64 hex chars) in the environment
 *   2. cd packages/backend && npx tsx scripts/encrypt-patient-phi.ts
 *
 * Dry run:
 *   npx tsx scripts/encrypt-patient-phi.ts --dry-run
 */

import { prisma } from '../src/config/db.js';
import { encrypt, isEncryptionEnabled, PATIENT_ENCRYPTED_FIELDS } from '../src/services/encryption.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 100;

function looksEncrypted(v: unknown): boolean {
  if (typeof v !== 'string' || !v) return false;
  // iv:authTag:ciphertext — three base64 segments separated by colons
  const parts = v.split(':');
  if (parts.length !== 3) return false;
  return parts.every(p => /^[A-Za-z0-9+/]+=*$/.test(p));
}

async function main() {
  if (!isEncryptionEnabled()) {
    console.error('PHI_ENCRYPTION_KEY is not configured. Set it to a 64-hex-char value and retry.');
    process.exit(1);
  }

  console.log(`[BACKFILL] mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'} fields=${PATIENT_ENCRYPTED_FIELDS.join(',')}`);

  let scanned = 0;
  let toEncrypt = 0;
  let written = 0;
  let cursor: number | undefined = undefined;

  while (true) {
    const rows = await prisma.patient.findMany({
      take: BATCH,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned++;
      const updates: Record<string, string | null> = {};
      let needsUpdate = false;
      for (const field of PATIENT_ENCRYPTED_FIELDS) {
        const value = (row as Record<string, unknown>)[field];
        if (typeof value === 'string' && value.length > 0 && !looksEncrypted(value)) {
          updates[field] = encrypt(value);
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        toEncrypt++;
        if (!DRY_RUN) {
          await prisma.patient.update({ where: { id: row.id }, data: updates });
          written++;
        }
      }
    }

    cursor = rows[rows.length - 1].id;
    console.log(`[BACKFILL] scanned=${scanned} to_encrypt=${toEncrypt} written=${written}`);
  }

  console.log(`[BACKFILL] done. scanned=${scanned} to_encrypt=${toEncrypt} written=${written}`);
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error('[BACKFILL] failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
