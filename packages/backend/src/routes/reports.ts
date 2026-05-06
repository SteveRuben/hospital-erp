import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Patients par période
router.get('/patients-periode', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT TO_CHAR(created_at, 'YYYY-MM') as mois, COUNT(*) as total FROM patients WHERE archived = FALSE GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY mois DESC LIMIT 12`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Consultations par médecin
router.get('/consultations-medecin', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT m.nom, m.prenom, m.specialite, COUNT(c.id) as total FROM medecins m LEFT JOIN consultations c ON c.medecin_id = m.id GROUP BY m.id, m.nom, m.prenom, m.specialite ORDER BY total DESC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Recettes par service
router.get('/recettes-service', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT s.nom, COALESCE(SUM(r.montant), 0) as total FROM services s LEFT JOIN recettes r ON r.service_id = s.id GROUP BY s.id, s.nom ORDER BY total DESC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Recettes mensuelles (12 derniers mois)
router.get('/recettes-mensuelles', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT TO_CHAR(date_recette, 'YYYY-MM') as mois, SUM(montant) as total FROM recettes WHERE date_recette >= CURRENT_DATE - INTERVAL '12 months' GROUP BY TO_CHAR(date_recette, 'YYYY-MM') ORDER BY mois`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Dépenses mensuelles
router.get('/depenses-mensuelles', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT TO_CHAR(date_depense, 'YYYY-MM') as mois, SUM(montant) as total FROM depenses WHERE date_depense >= CURRENT_DATE - INTERVAL '12 months' GROUP BY TO_CHAR(date_depense, 'YYYY-MM') ORDER BY mois`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Top diagnostics
router.get('/top-diagnostics', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT diagnostic, COUNT(*) as total FROM consultations WHERE diagnostic IS NOT NULL AND diagnostic != '' GROUP BY diagnostic ORDER BY total DESC LIMIT 10`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Occupation des lits
router.get('/occupation-lits', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT p.nom as pavillon, COUNT(l.id) as total_lits, COUNT(CASE WHEN l.statut = 'occupe' THEN 1 END) as occupes, COUNT(CASE WHEN l.statut = 'disponible' THEN 1 END) as disponibles FROM pavillons p LEFT JOIN lits l ON l.pavillon_id = p.id GROUP BY p.id, p.nom`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Activité labo
router.get('/activite-labo', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT type_examen, COUNT(*) as total, COALESCE(SUM(montant), 0) as revenus FROM examens GROUP BY type_examen ORDER BY total DESC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Répartition par mode de paiement
router.get('/modes-paiement', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT mode_paiement, COUNT(*) as nb, SUM(montant) as total FROM recettes WHERE mode_paiement IS NOT NULL GROUP BY mode_paiement`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;