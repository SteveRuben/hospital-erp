import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Empty <select> options post '' from the browser; treat it as "not provided"
// so .optional() enum fields validate instead of failing with a 400.
const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? null : v), schema);

// Numeric fields fed from HTML <input>/<select> arrive as strings ("37.5") and
// as empty strings ('') when left blank. Zod's z.number() rejects both, which
// surfaced as a 400 on POST /api/vitaux and other clinical forms. These helpers
// coerce a numeric string to a number and map ''/null/undefined to undefined so
// .optional() does its job. A non-numeric string is passed through unchanged so
// the underlying schema still raises a clear "expected number" error.
const toNumber = (v: unknown): unknown => {
  if (v === '' || v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return undefined;
    const n = Number(trimmed);
    return Number.isNaN(n) ? v : n;
  }
  return v;
};
const numeric = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(toNumber, schema);

// Generic validation middleware
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      res.status(400).json({ error: 'Données invalides', details: errors });
      return;
    }
    req.body = result.data;
    next();
  };
};

// Validate URL params are integers
export const validateIdParam = (req: Request, res: Response, next: NextFunction): void => {
  const id = req.params.id || req.params.patientId;
  if (id && (isNaN(Number(id)) || Number(id) < 1)) {
    res.status(400).json({ error: 'ID invalide' });
    return;
  }
  next();
};

// === SCHEMAS ===

export const loginSchema = z.object({
  username: z.string().min(1).max(100).trim(),
  password: z.string().min(1).max(255),
  mfa_token: z.string().length(6).regex(/^\d+$/, 'Code MFA: 6 chiffres').optional(),
});

export const createUserSchema = z.object({
  username: z.string().min(3).max(100).trim().regex(/^[a-zA-Z0-9_]+$/, 'Caractères alphanumériques uniquement'),
  password: z.string().min(8).max(255),
  role: z.enum(['admin', 'medecin', 'comptable', 'laborantin', 'reception', 'pharmacien', 'infirmier', 'super_admin', 'chef_pole']),
  nom: z.string().min(1).max(100).trim().optional(),
  prenom: z.string().min(1).max(100).trim().optional(),
  telephone: z.string().max(20).trim().optional(),
  facility_id: z.number().int().positive().optional(),
});

export const createPatientSchema = z.object({
  nom: z.string().min(1).max(100).trim(),
  prenom: z.string().min(1).max(100).trim(),
  deuxieme_prenom: z.string().max(100).trim().optional().nullable(),
  sexe: emptyToNull(z.enum(['M', 'F', 'autre']).optional().nullable()),
  date_naissance: z.string().optional().nullable(),
  age_estime: numeric(z.number().int().min(0).max(150).optional().nullable()),
  lieu_naissance: z.string().max(100).trim().optional().nullable(),
  nationalite: z.string().max(100).trim().optional().nullable(),
  numero_identite: z.string().max(50).trim().optional().nullable(),
  statut_matrimonial: emptyToNull(z.enum(['celibataire', 'marie', 'divorce', 'veuf']).optional().nullable()),
  groupe_sanguin: emptyToNull(z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional().nullable()),
  pays: z.string().max(100).trim().optional().nullable(),
  province: z.string().max(100).trim().optional().nullable(),
  ville: z.string().max(100).trim().optional().nullable(),
  commune: z.string().max(100).trim().optional().nullable(),
  quartier: z.string().max(100).trim().optional().nullable(),
  adresse: z.string().max(500).trim().optional().nullable(),
  profession: z.string().max(100).trim().optional().nullable(),
  telephone: z.string().max(20).trim().optional().nullable(),
  email: z.string().max(150).email().optional().nullable().or(z.literal('')),
  contact_urgence_nom: z.string().max(100).trim().optional().nullable(),
  contact_urgence_relation: z.string().max(50).trim().optional().nullable(),
  contact_urgence_telephone: z.string().max(20).trim().optional().nullable(),
});

export const createRecetteSchema = z.object({
  patient_id: numeric(z.number().int().positive().optional().nullable()),
  service_id: numeric(z.number().int().positive().optional().nullable()),
  type_acte: z.string().min(1).max(100).trim(),
  montant: numeric(z.number().positive().max(999999999)),
  mode_paiement: emptyToNull(z.enum(['especes', 'mobile_money', 'carte']).optional().nullable()),
  description: z.string().max(500).trim().optional().nullable(),
});

export const createDepenseSchema = z.object({
  type_depense: z.string().min(1).max(100).trim(),
  nature: z.string().max(100).trim().optional().nullable(),
  montant: numeric(z.number().positive().max(999999999)),
  fournisseur: z.string().max(100).trim().optional().nullable(),
  description: z.string().max(500).trim().optional().nullable(),
  date_depense: z.string().optional().nullable(),
});

export const createAllergieSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  allergene: z.string().min(1).max(200).trim(),
  type_allergie: emptyToNull(z.enum(['medicament', 'alimentaire', 'environnement', 'autre']).optional().nullable()),
  severite: emptyToNull(z.enum(['legere', 'moderee', 'severe', 'fatale']).optional().nullable()),
  reaction: z.string().max(500).trim().optional().nullable(),
  date_debut: z.string().optional().nullable(),
});

export const createPrescriptionSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  medecin_id: numeric(z.number().int().positive().optional().nullable()),
  consultation_id: numeric(z.number().int().positive().optional().nullable()),
  medicament: z.string().min(1).max(200).trim(),
  dosage: z.string().max(100).trim().optional().nullable(),
  frequence: z.string().max(100).trim().optional().nullable(),
  duree: z.string().max(100).trim().optional().nullable(),
  voie: z.string().max(50).trim().optional().nullable(),
  instructions: z.string().max(1000).trim().optional().nullable(),
  date_debut: z.string().optional().nullable(),
  date_fin: z.string().optional().nullable(),
});


// === FACTURATION SCHEMAS ===

export const createTarifSchema = z.object({
  code: z.string().min(1).max(50).trim(),
  libelle: z.string().min(1).max(200).trim(),
  categorie: z.string().min(1).max(100).trim(),
  montant: numeric(z.number().positive().max(50_000_000)), // Max 50M XOF
  service_id: numeric(z.number().int().positive().optional().nullable()),
});

export const createFactureSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  lignes: z.array(z.object({
    tarif_id: numeric(z.number().int().positive().optional().nullable()),
    libelle: z.string().min(1).max(200).trim(),
    quantite: numeric(z.number().int().positive().max(1000)),
    prix_unitaire: numeric(z.number().positive().max(50_000_000)),
  })).min(1, 'Au moins une ligne requise'),
  notes: z.string().max(1000).trim().optional().nullable(),
});

export const createPaiementSchema = z.object({
  facture_id: numeric(z.number().int().positive()),
  montant: numeric(z.number().positive().max(100_000_000)), // Max 100M XOF
  mode_paiement: emptyToNull(z.enum(['especes', 'mobile_money', 'carte', 'virement', 'assurance']).optional().nullable()),
  reference: z.string().max(100).trim().optional().nullable(),
  notes: z.string().max(500).trim().optional().nullable(),
});

// === MEDICAL ENTITIES ===

export const createMedecinSchema = z.object({
  nom: z.string().min(1).max(100).trim(),
  prenom: z.string().min(1).max(100).trim(),
  specialite: z.string().max(100).trim().optional().nullable(),
  telephone: z.string().max(20).trim().optional().nullable(),
});

export const createServiceSchema = z.object({
  nom: z.string().min(1).max(100).trim(),
  description: z.string().max(1000).trim().optional().nullable(),
});

export const createConsultationSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  medecin_id: numeric(z.number().int().positive().optional().nullable()),
  service_id: numeric(z.number().int().positive().optional().nullable()),
  diagnostic: z.string().max(2000).trim().optional().nullable(),
  traitement: z.string().max(2000).trim().optional().nullable(),
  notes: z.string().max(5000).trim().optional().nullable(),
  motif: z.string().max(500).trim().optional().nullable(),
  gravite: emptyToNull(z.enum(['benigne', 'moderee', 'severe', 'critique']).optional().nullable()),
});

export const createPathologieSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  nom: z.string().min(1).max(200).trim(),
  code_cim: z.string().max(20).trim().optional().nullable(),
  statut: emptyToNull(z.enum(['active', 'guerie', 'chronique', 'remission']).optional().nullable()),
  date_debut: z.string().optional().nullable(),
  date_fin: z.string().optional().nullable(),
  notes: z.string().max(2000).trim().optional().nullable(),
});

export const createVaccinationSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  medecin_id: numeric(z.number().int().positive().optional().nullable()),
  vaccin: z.string().min(1).max(200).trim(),
  lot: z.string().max(100).trim().optional().nullable(),
  dose: z.string().max(50).trim().optional().nullable(),
  montant: numeric(z.number().min(0).max(10_000_000).optional().nullable()),
  site_injection: z.string().max(100).trim().optional().nullable(),
  date_vaccination: z.string().optional().nullable(),
  date_rappel: z.string().optional().nullable(),
  notes: z.string().max(1000).trim().optional().nullable(),
});

export const createNoteSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  titre: z.string().max(200).trim().optional().nullable(),
  contenu: z.string().min(1).max(10000).trim(),
  type_note: emptyToNull(z.enum(['general', 'medical', 'admin', 'urgence']).optional().nullable()),
});

export const createAlerteSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  type_alerte: z.string().max(50).trim().optional().nullable(),
  message: z.string().min(1).max(2000).trim(),
  severite: emptyToNull(z.enum(['info', 'warning', 'critique']).optional().nullable()),
});

export const createOrdonnanceSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  medecin_id: numeric(z.number().int().positive().optional().nullable()),
  consultation_id: numeric(z.number().int().positive().optional().nullable()),
  notes: z.string().max(2000).trim().optional().nullable(),
});

export const createRendezVousSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  medecin_id: numeric(z.number().int().positive()),
  service_id: numeric(z.number().int().positive().optional().nullable()),
  date_rdv: z.string().min(1, 'Date requise'),
  motif: z.string().max(500).trim().optional().nullable(),
  notes: z.string().max(2000).trim().optional().nullable(),
});

export const createVitalSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  medecin_id: numeric(z.number().int().positive().optional().nullable()),
  temperature: numeric(z.number().min(20).max(50).optional().nullable()),
  tension_systolique: numeric(z.number().int().min(30).max(300).optional().nullable()),
  tension_diastolique: numeric(z.number().int().min(20).max(200).optional().nullable()),
  pouls: numeric(z.number().int().min(20).max(300).optional().nullable()),
  frequence_respiratoire: numeric(z.number().int().min(5).max(80).optional().nullable()),
  saturation_o2: numeric(z.number().int().min(0).max(100).optional().nullable()),
  poids: numeric(z.number().min(0).max(500).optional().nullable()),
  taille: numeric(z.number().min(0).max(300).optional().nullable()),
  glycemie: numeric(z.number().min(0).max(50).optional().nullable()),
  notes: z.string().max(1000).trim().optional().nullable(),
});

export const createVisiteSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  service_id: numeric(z.number().int().positive().optional().nullable()),
  type_visite: emptyToNull(z.enum(['ambulatoire', 'urgence', 'hospitalisation', 'consultation']).optional().nullable()),
  notes: z.string().max(2000).trim().optional().nullable(),
});

export const createPavillonSchema = z.object({
  nom: z.string().min(1).max(100).trim(),
  etage: numeric(z.number().int().min(-5).max(50).optional().nullable()),
  service_id: numeric(z.number().int().positive().optional().nullable()),
  capacite: numeric(z.number().int().min(0).max(1000).optional().nullable()),
  description: z.string().max(1000).trim().optional().nullable(),
});

export const createLitSchema = z.object({
  pavillon_id: numeric(z.number().int().positive()),
  numero: z.string().min(1).max(50).trim(),
  type_lit: z.string().max(50).trim().optional().nullable(),
});

export const createConceptSchema = z.object({
  nom: z.string().min(1).max(200).trim(),
  code: z.string().max(50).trim().optional().nullable(),
  datatype: z.enum(['numeric', 'coded', 'text', 'date', 'boolean', 'datetime', 'document']),
  classe: z.enum(['diagnostic', 'symptome', 'test', 'medicament', 'procedure', 'finding', 'question', 'reponse', 'misc']),
  description: z.string().max(2000).trim().optional().nullable(),
  unite: z.string().max(50).trim().optional().nullable(),
  valeur_min: numeric(z.number().optional().nullable()),
  valeur_max: numeric(z.number().optional().nullable()),
});

export const createEncounterSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  encounter_type_id: numeric(z.number().int().positive()),
  visite_id: numeric(z.number().int().positive().optional().nullable()),
  service_id: numeric(z.number().int().positive().optional().nullable()),
  notes: z.string().max(5000).trim().optional().nullable(),
  observations: z.array(z.unknown()).optional().nullable(),
});

export const createOrderSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  encounter_id: numeric(z.number().int().positive().optional().nullable()),
  concept_id: numeric(z.number().int().positive().optional().nullable()),
  type_order: z.enum(['drug', 'lab', 'imaging', 'procedure', 'referral', 'observation']),
  urgence: emptyToNull(z.enum(['routine', 'urgent', 'stat']).optional().nullable()),
  instructions: z.string().max(2000).trim().optional().nullable(),
  dosage: z.string().max(100).trim().optional().nullable(),
  frequence: z.string().max(100).trim().optional().nullable(),
  duree: z.string().max(100).trim().optional().nullable(),
  voie: z.string().max(50).trim().optional().nullable(),
  quantite: numeric(z.number().int().min(0).max(100000).optional().nullable()),
});

export const createMedicamentSchema = z.object({
  nom: z.string().min(1).max(200).trim(),
  dci: z.string().max(200).trim().optional().nullable(),
  forme: z.string().max(100).trim().optional().nullable(),
  dosage_standard: z.string().max(100).trim().optional().nullable(),
  code_barre: z.string().max(100).trim().optional().nullable(),
  categorie: z.string().max(100).trim().optional().nullable(),
  prix_unitaire: numeric(z.number().min(0).max(10_000_000).optional().nullable()),
});

export const createStockSchema = z.object({
  medicament_id: numeric(z.number().int().positive()),
  lot: z.string().max(100).trim().optional().nullable(),
  date_expiration: z.string().optional().nullable(),
  quantite: numeric(z.number().int().min(0).max(1_000_000)),
  quantite_min: numeric(z.number().int().min(0).max(1_000_000).optional().nullable()),
  prix_achat: numeric(z.number().min(0).max(10_000_000).optional().nullable()),
  fournisseur: z.string().max(200).trim().optional().nullable(),
});

// POST /pharmacie/mouvements had no validation at all: medicament_id and
// quantite arrived from the frontend as strings and were passed straight to
// Prisma, which rejected them with "Expected Int or Null, provided String"
// (500 on every entrée/sortie). Same numeric-coercion pattern as createStockSchema.
export const createMouvementSchema = z.object({
  medicament_id: numeric(z.number().int().positive()),
  type_mouvement: z.enum(['entree', 'sortie', 'ajustement', 'perime']),
  quantite: numeric(z.number().int().positive().max(1_000_000)),
  lot: z.string().max(100).trim().optional().nullable(),
  motif: z.string().max(500).trim().optional().nullable(),
});

export const createProgrammeSchema = z.object({
  nom: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).trim().optional().nullable(),
  type_programme: z.string().max(100).trim().optional().nullable(),
});

// === WORKFLOW / ADMIN SCHEMAS ===

export const createFileAttenteSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
  service_id: numeric(z.number().int().positive().optional().nullable()),
  priorite: emptyToNull(z.enum(['normale', 'urgente', 'vitale']).optional().nullable()),
  notes: z.string().max(1000).trim().optional().nullable(),
});

export const createListePatientsSchema = z.object({
  nom: z.string().min(1).max(200).trim(),
  description: z.string().max(1000).trim().optional().nullable(),
});

export const addPatientToListeSchema = z.object({
  patient_id: numeric(z.number().int().positive()),
});

export const createFormulaireSchema = z.object({
  nom: z.string().min(1).max(200).trim(),
  description: z.string().max(1000).trim().optional().nullable(),
  schema_json: z.unknown(), // JSON form schema, opaque
  service_id: numeric(z.number().int().positive().optional().nullable()),
});

export const createReponseFormulaireSchema = z.object({
  formulaire_id: numeric(z.number().int().positive()),
  patient_id: numeric(z.number().int().positive()),
  donnees_json: z.unknown(),
});

export const requestOtpSchema = z.object({
  contact: z.string().min(1).max(150).trim(), // phone or email
});

export const verifyOtpSchema = z.object({
  contact: z.string().min(1).max(150).trim(),
  code: z.string().length(6).regex(/^\d+$/, 'Code OTP: 6 chiffres'),
});

export const bookRendezVousPortalSchema = z.object({
  service_id: numeric(z.number().int().positive().optional().nullable()),
  medecin_id: numeric(z.number().int().positive().optional().nullable()),
  date_rdv: z.string().min(1, 'Date requise'),
  motif: z.string().max(500).trim().optional().nullable(),
});

export const patientMergeSchema = z.object({
  keep_id: numeric(z.number().int().positive()),
  merge_id: numeric(z.number().int().positive()),
}).refine(d => d.keep_id !== d.merge_id, { message: 'keep_id et merge_id doivent être différents' });

export const createPlanningSchema = z.object({
  medecin_id: numeric(z.number().int().positive()),
  service_id: numeric(z.number().int().positive().optional().nullable()),
  jour_semaine: numeric(z.number().int().min(0).max(6)),
  heure_debut: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Format HH:MM'),
  heure_fin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Format HH:MM'),
  duree_creneau: numeric(z.number().int().min(5).max(240).optional().nullable()),
});

export const createBlocageSchema = z.object({
  medecin_id: numeric(z.number().int().positive()),
  date_debut: z.string().min(1),
  date_fin: z.string().min(1),
  motif: z.string().max(500).trim().optional().nullable(),
});

export const createFacilitySchema = z.object({
  nom: z.string().min(1).max(200).trim(),
  code: z.string().max(50).trim().optional().nullable(),
  type_facility: z.enum(['hopital', 'clinique', 'centre_sante', 'cabinet', 'autre']).optional().nullable(),
  adresse: z.string().max(500).trim().optional().nullable(),
  ville: z.string().max(100).trim().optional().nullable(),
  telephone: z.string().max(20).trim().optional().nullable(),
  email: z.string().email().max(150).optional().nullable().or(z.literal('').transform(() => null)),
});

export const createImagerieSchema = z.object({
  patient_id: z.preprocess(v => Number(v), z.number().int().positive()), // multipart: comes as string
  type_examen: z.string().max(100).trim().optional().nullable(),
  description: z.string().max(1000).trim().optional().nullable(),
  date_examen: z.string().optional().nullable(),
  medecin_id: z.preprocess(v => v === '' || v === undefined || v === null ? null : Number(v), z.number().int().positive().nullable()).optional(),
  montant: z.preprocess(v => v === '' || v === undefined ? undefined : Number(v), z.number().positive().optional()),
});

// === BUSINESS LIMITS ===
export const BUSINESS_LIMITS = {
  MAX_RECETTE_MONTANT: 100_000_000, // 100M XOF
  MAX_DEPENSE_MONTANT: 100_000_000,
  MAX_FACTURE_LIGNE_MONTANT: 50_000_000,
  MAX_PAIEMENT_MONTANT: 100_000_000,
  MAX_PRESCRIPTIONS_PER_DAY: 50,
  MAX_CONSULTATIONS_PER_DAY: 100,
};
