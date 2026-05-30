/**
 * Access control service
 * Centralizes authorization checks beyond simple role-gates.
 *
 * canAccessPatient:
 *   - admin / comptable / laborantin / reception / pharmacien → all patients
 *   - medecin → only patients linked via:
 *       1. patient_attributions table (explicit attribution, recommended)
 *       2. consultations history (medecin name/prenom matches user) — legacy fallback
 *
 * patientAccessScope:
 *   - returns a discriminated union { kind: 'all' } | { kind: 'restricted', ids: number[] }
 *   - replaces the older nullable-array contract from accessiblePatientIds()
 *     which is HIPAA-fragile: a single missed null check at a call site
 *     silently grants full access. The discriminated union makes that
 *     mistake impossible — the caller must handle both kinds.
 */

import { prisma } from '../config/db.js';

export interface AccessUser {
  id: number;
  role: string;
}

export type PatientAccessScope =
  | { kind: 'all' }
  | { kind: 'restricted'; ids: number[] };

/**
 * Returns true if the given user can access the given patient's record.
 * Non-medecin roles always return true. Medecin must have an attribution
 * or a prior consultation with this patient.
 */
export async function canAccessPatient(user: AccessUser, patientId: number): Promise<boolean> {
  if (user.role !== 'medecin') return true;

  // Three signals, in priority order:
  //   1. patient_attributions table (explicit attribution).
  //   2. consultations linked via medecins.user_id FK (P0-6 phase 1).
  //   3. consultations linked via the legacy nom+prenom string match —
  //      kept only as a transition fallback for Medecin rows where the
  //      FK has not been backfilled (manual rename / no matching user).
  const rows = await prisma.$queryRaw<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM patient_attributions
      WHERE medecin_user_id = ${user.id} AND patient_id = ${patientId} AND actif = TRUE
    UNION ALL
    SELECT 1 AS ok FROM consultations c
      JOIN medecins m ON c.medecin_id = m.id
      WHERE m.user_id = ${user.id} AND c.patient_id = ${patientId}
    UNION ALL
    SELECT 1 AS ok FROM consultations c
      JOIN medecins m ON c.medecin_id = m.id
      JOIN users u ON u.nom = m.nom AND u.prenom = m.prenom AND u.id = ${user.id}
      WHERE m.user_id IS NULL AND c.patient_id = ${patientId}
    LIMIT 1
  `;

  return rows.length > 0;
}

/**
 * HIPAA "Minimum Necessary" (§164.502(b)): when a medecin lists/searches
 * any patient-scoped resource (patients, consultations, RDV, lab exams,
 * orders, invoices, …), the result set must be restricted to patients
 * they're attributed to (or have an existing consultation with).
 *
 * Returns a discriminated union so the caller cannot accidentally treat
 * "unrestricted" as "empty list" or vice versa. Apply with:
 *
 *   const scope = await patientAccessScope(user);
 *   if (scope.kind === 'restricted') where.patientId = { in: scope.ids };
 *
 * Non-medecin roles → { kind: 'all' }.
 */
export async function patientAccessScope(user: AccessUser): Promise<PatientAccessScope> {
  if (user.role !== 'medecin') return { kind: 'all' };

  // Three signals (same priority order as canAccessPatient — the FK
  // join is now the primary path; the name-match fallback only fires
  // for unmigrated Medecin rows).
  const rows = await prisma.$queryRaw<Array<{ patient_id: number }>>`
    SELECT DISTINCT patient_id FROM (
      SELECT patient_id FROM patient_attributions
        WHERE medecin_user_id = ${user.id} AND actif = TRUE AND patient_id IS NOT NULL
      UNION
      SELECT c.patient_id FROM consultations c
        JOIN medecins m ON c.medecin_id = m.id
        WHERE m.user_id = ${user.id}
      UNION
      SELECT c.patient_id FROM consultations c
        JOIN medecins m ON c.medecin_id = m.id
        JOIN users u ON u.nom = m.nom AND u.prenom = m.prenom AND u.id = ${user.id}
        WHERE m.user_id IS NULL
    ) t
  `;

  return { kind: 'restricted', ids: rows.map(r => r.patient_id) };
}

/**
 * @deprecated Use patientAccessScope. The nullable-array return makes it
 * easy to silently disable the filter by forgetting the null check. Kept
 * as a thin shim while existing call sites migrate.
 */
export async function accessiblePatientIds(user: AccessUser): Promise<number[] | null> {
  const scope = await patientAccessScope(user);
  return scope.kind === 'all' ? null : scope.ids;
}

export default { canAccessPatient, accessiblePatientIds, patientAccessScope };
