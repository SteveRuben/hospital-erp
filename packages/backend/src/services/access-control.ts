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

// Roles that participate in patient-level filtering. Anyone outside
// this set is treated as full-access (admin, comptable, etc.). Adding
// a new role to UserRole that should be patient-scoped means adding it
// here too — otherwise the role bypasses HIPAA filtering silently.
const RESTRICTED_ROLES = new Set(['medecin', 'infirmier']);

/**
 * Returns true if the given user can access the given patient's record.
 * Roles in RESTRICTED_ROLES are gated by:
 *   1. an explicit patient_attribution,
 *   2. a personal consultation with the patient,
 *   3. being chef médecin of a service the patient was consulted in,
 *   4. being the suppléant of a (currently suspended) medecin in (1)/(2)/(3),
 *   5. having an active visite/hospitalisation for the patient in the
 *      user's own service (= "patient is in my unit right now").
 * Any other role returns true unconditionally.
 */
export async function canAccessPatient(user: AccessUser, patientId: number): Promise<boolean> {
  if (!RESTRICTED_ROLES.has(user.role)) return true;

  const rows = await prisma.$queryRaw<Array<{ ok: number }>>`
    -- 1. Direct attribution.
    SELECT 1 AS ok FROM patient_attributions
      WHERE medecin_user_id = ${user.id} AND patient_id = ${patientId} AND actif = TRUE
    UNION ALL
    -- 2. The user's own consultation history with this patient.
    SELECT 1 AS ok FROM consultations
      WHERE medecin_id = ${user.id} AND patient_id = ${patientId}
    UNION ALL
    -- 3. Chef médecin: the patient was consulted in a service the user heads.
    SELECT 1 AS ok FROM consultations c
      JOIN services s ON c.service_id = s.id
      WHERE s.chef_medecin_user_id = ${user.id} AND c.patient_id = ${patientId}
    UNION ALL
    -- 4. Suppléant — only active while the titular medecin is suspended.
    SELECT 1 AS ok FROM consultations c
      JOIN users m ON c.medecin_id = m.id
      WHERE m.suppleant_user_id = ${user.id} AND m.suspended = TRUE
        AND c.patient_id = ${patientId}
    UNION ALL
    -- 5. Same-unit attendance: patient is currently in the user's service
    --    (active visite or active hospitalisation). When the patient is
    --    discharged, this clause stops matching automatically.
    SELECT 1 AS ok FROM visites v
      JOIN users u ON u.id = ${user.id}
      WHERE v.service_id = u.service_id
        AND v.statut = 'active'::"VisiteStatut"
        AND v.patient_id = ${patientId}
    UNION ALL
    SELECT 1 AS ok FROM hospitalisations h
      JOIN users u ON u.id = ${user.id}
      WHERE h.service_id = u.service_id
        AND h.statut = 'active'::"HospitalisationStatut"
        AND h.patient_id = ${patientId}
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
  if (!RESTRICTED_ROLES.has(user.role)) return { kind: 'all' };

  // Mirrors canAccessPatient's five clauses. Each SELECT contributes
  // patient_ids to the union; DISTINCT collapses overlap (a chef
  // médecin who also has personal consultations with a patient lands
  // once). The empty result is "no patients" — caller's WHERE patient_id
  // IN () then matches nothing, which is the safe HIPAA default.
  const rows = await prisma.$queryRaw<Array<{ patient_id: number }>>`
    SELECT DISTINCT patient_id FROM (
      SELECT patient_id FROM patient_attributions
        WHERE medecin_user_id = ${user.id} AND actif = TRUE AND patient_id IS NOT NULL
      UNION
      SELECT patient_id FROM consultations
        WHERE medecin_id = ${user.id}
      UNION
      SELECT c.patient_id FROM consultations c
        JOIN services s ON c.service_id = s.id
        WHERE s.chef_medecin_user_id = ${user.id}
      UNION
      SELECT c.patient_id FROM consultations c
        JOIN users m ON c.medecin_id = m.id
        WHERE m.suppleant_user_id = ${user.id} AND m.suspended = TRUE
      UNION
      SELECT v.patient_id FROM visites v
        JOIN users u ON u.id = ${user.id}
        WHERE v.service_id = u.service_id
          AND v.statut = 'active'::"VisiteStatut"
      UNION
      SELECT h.patient_id FROM hospitalisations h
        JOIN users u ON u.id = ${user.id}
        WHERE h.service_id = u.service_id
          AND h.statut = 'active'::"HospitalisationStatut"
    ) t
    WHERE patient_id IS NOT NULL
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
