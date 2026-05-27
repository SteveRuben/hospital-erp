/**
 * Access control service
 * Centralizes authorization checks beyond simple role-gates.
 *
 * canAccessPatient:
 *   - admin / comptable / laborantin / reception → all patients (full access)
 *   - medecin → only patients linked via:
 *       1. patient_attributions table (explicit attribution, recommended)
 *       2. consultations history (medecin name/prenom matches user) — legacy fallback
 */

import { prisma } from '../config/db.js';

export interface AccessUser {
  id: number;
  role: string;
}

/**
 * Returns true if the given user can access the given patient's record.
 * Non-medecin roles always return true. Medecin must have an attribution
 * or a prior consultation with this patient.
 */
export async function canAccessPatient(user: AccessUser, patientId: number): Promise<boolean> {
  if (user.role !== 'medecin') return true;

  const rows = await prisma.$queryRaw<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM patient_attributions
      WHERE medecin_user_id = ${user.id} AND patient_id = ${patientId} AND actif = TRUE
    UNION ALL
    SELECT 1 AS ok FROM consultations c
      JOIN medecins m ON c.medecin_id = m.id
      JOIN users u ON u.nom = m.nom AND u.prenom = m.prenom AND u.id = ${user.id}
      WHERE c.patient_id = ${patientId}
    LIMIT 1
  `;

  return rows.length > 0;
}

/**
 * HIPAA "Minimum Necessary" (§164.502(b)): when a medecin lists/searches patients,
 * the result set must be restricted to patients they're attributed to (or have an
 * existing consultation with). Without this, an unattributed medecin can enumerate
 * the entire patient roster via /patients, /patients/search/quick, /search/advanced
 * — they can't OPEN a record (canAccessPatient blocks that), but names + phones
 * leak via the list, which is PHI under HIPAA.
 *
 * Returns a Prisma `where` fragment to AND into list queries. For non-medecin
 * roles, returns {} (no extra filter — full roster access by role design).
 */
export async function accessiblePatientIds(user: AccessUser): Promise<number[] | null> {
  if (user.role !== 'medecin') return null; // null = no filter, full access

  const rows = await prisma.$queryRaw<Array<{ patient_id: number }>>`
    SELECT DISTINCT patient_id FROM (
      SELECT patient_id FROM patient_attributions
        WHERE medecin_user_id = ${user.id} AND actif = TRUE AND patient_id IS NOT NULL
      UNION
      SELECT c.patient_id FROM consultations c
        JOIN medecins m ON c.medecin_id = m.id
        JOIN users u ON u.nom = m.nom AND u.prenom = m.prenom AND u.id = ${user.id}
    ) t
  `;

  return rows.map(r => r.patient_id);
}

export default { canAccessPatient, accessiblePatientIds };
