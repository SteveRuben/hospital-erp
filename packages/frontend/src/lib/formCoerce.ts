/**
 * Form-data coercion helpers — extracted from page components so they
 * can be unit-tested without rendering a wizard. Every bug that landed
 * in prod this week (RDV strings, groupe_sanguin enum, PatientForm
 * null/camelCase) lived in similar coercion code embedded inside a
 * form. Putting it here means a test can pin the behaviour.
 */

// --- PatientForm: server payload → form state ----------------------

// Prisma's GroupeSanguin enum is { Aplus, Amoins, … } with @map("A+")
// etc. The API returns the variant name (e.g. "Aplus"). The form's
// <select> options use the human label "A+" — bridge both directions.
export const GROUPE_API_TO_FORM: Record<string, string> = {
  Aplus: 'A+', Amoins: 'A-', Bplus: 'B+', Bmoins: 'B-',
  ABplus: 'AB+', ABmoins: 'AB-', Oplus: 'O+', Omoins: 'O-',
};

export interface PatientFormShape {
  nom: string; prenom: string; deuxieme_prenom: string;
  sexe: string; date_naissance: string; age_estime: string;
  lieu_naissance: string; nationalite: string; numero_identite: string;
  statut_matrimonial: string; groupe_sanguin: string;
  pays: string; province: string; ville: string; commune: string;
  quartier: string; adresse: string; profession: string;
  telephone: string; email: string;
  contact_urgence_nom: string; contact_urgence_relation: string;
  contact_urgence_telephone: string;
}

/**
 * Coerce server camelCase / nullable patient payload into the snake-case
 * string-only shape the form state expects. Without this, nulls leak
 * into <select value> (React warning) and the wizard silently loses
 * values on save because camelCase keys never overwrite snake_case slots.
 */
export function patientServerToForm(p: Record<string, any>): PatientFormShape {
  const s = (v: unknown) => (v == null ? '' : String(v));
  const dateOnly = (v: unknown) => {
    if (!v) return '';
    const iso = String(v);
    return iso.length >= 10 ? iso.slice(0, 10) : '';
  };
  return {
    nom: s(p.nom),
    prenom: s(p.prenom),
    deuxieme_prenom: s(p.deuxiemePrenom ?? p.deuxieme_prenom),
    sexe: s(p.sexe),
    date_naissance: dateOnly(p.dateNaissance ?? p.date_naissance),
    age_estime: s(p.ageEstime ?? p.age_estime),
    lieu_naissance: s(p.lieuNaissance ?? p.lieu_naissance),
    nationalite: s(p.nationalite),
    numero_identite: s(p.numeroIdentite ?? p.numero_identite),
    statut_matrimonial: s(p.statutMatrimonial ?? p.statut_matrimonial),
    groupe_sanguin: (() => {
      const raw = p.groupeSanguin ?? p.groupe_sanguin;
      if (raw == null) return '';
      return GROUPE_API_TO_FORM[String(raw)] ?? String(raw);
    })(),
    pays: s(p.pays),
    province: s(p.province),
    ville: s(p.ville),
    commune: s(p.commune),
    quartier: s(p.quartier),
    adresse: s(p.adresse),
    profession: s(p.profession),
    telephone: s(p.telephone),
    email: s(p.email),
    contact_urgence_nom: s(p.contactUrgenceNom ?? p.contact_urgence_nom),
    contact_urgence_relation: s(p.contactUrgenceRelation ?? p.contact_urgence_relation),
    contact_urgence_telephone: s(p.contactUrgenceTelephone ?? p.contact_urgence_telephone),
  };
}

// --- RDV form: form state → POST payload ---------------------------

export interface RdvFormShape {
  patient_id: string; medecin_id: string; service_id: string;
  date_rdv: string; motif: string; notes: string;
  priorite?: 'urgent' | 'prioritaire' | 'normal';
}

/**
 * The backend createRendezVousSchema types FKs as z.number().int().positive()
 * but HTML <select>/typeahead store strings. Coerce IDs, drop optional
 * fields when empty so Zod sees undefined not NaN.
 *
 * Throws if patient_id or medecin_id is missing — caller decides how
 * to surface the error to the user (the form does an alert).
 */
export function coerceRdvPayload(form: RdvFormShape): Record<string, unknown> {
  if (!form.patient_id) throw new Error('patient_id required');
  if (!form.medecin_id) throw new Error('medecin_id required');
  const payload: Record<string, unknown> = {
    patient_id: Number(form.patient_id),
    medecin_id: Number(form.medecin_id),
    date_rdv: form.date_rdv,
    motif: form.motif || undefined,
    notes: form.notes || undefined,
  };
  if (form.service_id) payload.service_id = Number(form.service_id);
  if (form.priorite) payload.priorite = form.priorite;
  return payload;
}
