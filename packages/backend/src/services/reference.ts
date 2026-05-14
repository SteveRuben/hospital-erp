/**
 * Reference ID Generation Service
 * Generates configurable patient IDs based on a template format.
 * 
 * Format variables:
 *   {YYYY} — full year (2026)
 *   {YY}   — 2-digit year (26)
 *   {MM}   — month (05)
 *   {DD}   — day (14)
 *   {YYMM} — year+month (2605)
 *   {NP}   — initials: first letter of nom + first letter of prenom (MJ)
 *   {SEQ:N} — sequential number padded to N digits (0015)
 *   {PREFIX} — value from patient_id_prefix setting (PAT)
 * 
 * Default format: PAT-{YYMM}-{NP}-{SEQ:4}
 * Example: PAT-2605-MJ-0015
 */

import { prisma } from '../config/db.js';

// Cache settings to avoid DB hit on every patient creation
let cachedFormat: string | null = null;
let cachedPrefix: string | null = null;
let cacheExpiry = 0;

async function getSettings(): Promise<{ format: string; prefix: string }> {
  if (cachedFormat && cacheExpiry > Date.now()) {
    return { format: cachedFormat, prefix: cachedPrefix || 'PAT' };
  }

  try {
    const rows = await prisma.setting.findMany({
      where: { cle: { in: ['patient_id_format', 'patient_id_prefix'] } },
      select: { cle: true, valeur: true },
    });
    for (const row of rows) {
      if (row.cle === 'patient_id_format') cachedFormat = row.valeur;
      if (row.cle === 'patient_id_prefix') cachedPrefix = row.valeur;
    }
  } catch {
    // Fallback if settings table doesn't exist yet
  }

  cachedFormat = cachedFormat || 'PAT-{YYMM}-{NP}-{SEQ:4}';
  cachedPrefix = cachedPrefix || 'PAT';
  cacheExpiry = Date.now() + 60_000; // Cache for 1 minute

  return { format: cachedFormat, prefix: cachedPrefix };
}

/**
 * Generate a unique patient reference ID
 */
export async function generatePatientReferenceId(nom: string, prenom: string): Promise<string> {
  const { format, prefix } = await getSettings();
  const now = new Date();

  const yyyy = String(now.getFullYear());
  const yy = yyyy.slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const yymm = yy + mm;
  const np = (nom.charAt(0) + prenom.charAt(0)).toUpperCase();

  // Get the next sequential number for today
  const dayStart = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const count = await prisma.patient.count({
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
  });
  const seq = count + 1;

  // Replace variables in format
  let refId = format
    .replace('{PREFIX}', prefix)
    .replace('{YYYY}', yyyy)
    .replace('{YY}', yy)
    .replace('{MM}', mm)
    .replace('{DD}', dd)
    .replace('{YYMM}', yymm)
    .replace('{NP}', np);

  // Handle {SEQ:N} — sequential with padding
  const seqMatch = refId.match(/\{SEQ:(\d+)\}/);
  if (seqMatch) {
    const padLength = parseInt(seqMatch[1]);
    refId = refId.replace(seqMatch[0], String(seq).padStart(padLength, '0'));
  } else {
    refId = refId.replace('{SEQ}', String(seq));
  }

  return refId;
}

/**
 * Generate a short unique reference for a table (used for encounters, orders, etc.)
 * Format: PREFIX-YYMMDD-NNNN  where NNNN is a daily sequence per table.
 */
export async function generateReference(tableName: string): Promise<string> {
  const prefixMap: Record<string, string> = {
    encounters: 'ENC',
    orders: 'ORD',
    consultations: 'CONS',
    examens: 'EXM',
    factures: 'FAC',
  };
  const prefix = prefixMap[tableName] ?? tableName.slice(0, 3).toUpperCase();

  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const ymd = `${yy}${mm}${dd}`;

  const dayStart = new Date(`${now.getFullYear()}-${mm}-${dd}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  // Use raw SQL because we need a dynamic table name (Prisma client can't do that)
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*)::bigint AS c FROM ${tableName} WHERE created_at >= $1 AND created_at < $2`,
    dayStart,
    dayEnd,
  );
  const seq = Number(rows[0]?.c ?? 0n) + 1;

  return `${prefix}-${ymd}-${String(seq).padStart(4, '0')}`;
}

/**
 * Invalidate the settings cache (call after settings update)
 */
export function invalidateCache(): void {
  cachedFormat = null;
  cachedPrefix = null;
  cacheExpiry = 0;
}

export default { generatePatientReferenceId, generateReference, invalidateCache };
