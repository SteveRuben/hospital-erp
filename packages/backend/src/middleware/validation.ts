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