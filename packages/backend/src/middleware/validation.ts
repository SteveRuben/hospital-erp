import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

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
  role: z.enum(['admin', 'medecin', 'comptable', 'laborantin', 'reception']),
  nom: z.string().min(1).max(100).trim().optional(),
  prenom: z.string().min(1).max(100).trim().optional(),
  telephone: z.string().max(20).trim().optional(),
});

export const createPatientSchema = z.object({
  nom: z.string().min(1).max(100).trim(),
  prenom: z.string().min(1).max(100).trim(),
  date_naissance: z.string().optional().nullable(),
  lieu_naissance: z.string().max(100).trim().optional().nullable(),
  adresse: z.string().max(500).trim().optional().nullable(),
  profession: z.string().max(100).trim().optional().nullable(),
  telephone: z.string().max(20).trim().optional().nullable(),
  contact_urgence: z.string().max(100).trim().optional().nullable(),
});

export const createRecetteSchema = z.object({
  patient_id: z.number().int().positive().optional().nullable(),
  service_id: z.number().int().positive().optional().nullable(),
  type_acte: z.string().min(1).max(100).trim(),
  montant: z.number().positive().max(999999999),
  mode_paiement: z.enum(['especes', 'mobile_money', 'carte']).optional(),
  description: z.string().max(500).trim().optional().nullable(),
});

export const createDepenseSchema = z.object({
  type_depense: z.string().min(1).max(100).trim(),
  nature: z.string().max(100).trim().optional().nullable(),
  montant: z.number().positive().max(999999999),
  fournisseur: z.string().max(100).trim().optional().nullable(),
  description: z.string().max(500).trim().optional().nullable(),
  date_depense: z.string().optional().nullable(),
});

export const createAllergieSchema = z.object({
  patient_id: z.number().int().positive(),
  allergene: z.string().min(1).max(200).trim(),
  type_allergie: z.enum(['medicament', 'alimentaire', 'environnement', 'autre']).optional(),
  severite: z.enum(['legere', 'moderee', 'severe', 'fatale']).optional(),
  reaction: z.string().max(500).trim().optional().nullable(),
  date_debut: z.string().optional().nullable(),
});

export const createPrescriptionSchema = z.object({
  patient_id: z.number().int().positive(),
  medecin_id: z.number().int().positive().optional().nullable(),
  consultation_id: z.number().int().positive().optional().nullable(),
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
  montant: z.number().positive().max(50_000_000), // Max 50M XOF
  service_id: z.number().int().positive().optional().nullable(),
});

export const createFactureSchema = z.object({
  patient_id: z.number().int().positive(),
  lignes: z.array(z.object({
    tarif_id: z.number().int().positive().optional().nullable(),
    libelle: z.string().min(1).max(200).trim(),
    quantite: z.number().int().positive().max(1000),
    prix_unitaire: z.number().positive().max(50_000_000),
  })).min(1, 'Au moins une ligne requise'),
  notes: z.string().max(1000).trim().optional().nullable(),
});

export const createPaiementSchema = z.object({
  facture_id: z.number().int().positive(),
  montant: z.number().positive().max(100_000_000), // Max 100M XOF
  mode_paiement: z.enum(['especes', 'mobile_money', 'carte', 'virement', 'assurance']).optional(),
  reference: z.string().max(100).trim().optional().nullable(),
  notes: z.string().max(500).trim().optional().nullable(),
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
