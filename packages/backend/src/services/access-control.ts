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

import { query } from '../config/db.js';

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

  const result = await query(
    `SELECT 1 FROM patient_attributions WHERE medecin_user_id = $1 AND patient_id = $2 AND actif = TRUE
     UNION ALL
     SELECT 1 FROM consultations c JOIN medecins m ON c.medecin_id = m.id
       JOIN users u ON u.nom = m.nom AND u.prenom = m.prenom AND u.id = $1
       WHERE c.patient_id = $2
     LIMIT 1`,
    [user.id, patientId]
  );

  return result.rows.length > 0;
}

export default { canAccessPatient };
