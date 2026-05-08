import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createFormulaireSchema, createReponseFormulaireSchema } from '../middleware/validation.js';

const router = Router();

// Get all form definitions
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT f.*, s.nom as service_nom FROM formulaires f LEFT JOIN services s ON f.service_id = s.id WHERE f.actif = TRUE ORDER BY f.nom');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create form definition
router.post('/', authenticate, authorize('admin'), validate(createFormulaireSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, description, schema_json, service_id } = req.body;
    const result = await query(`INSERT INTO formulaires (nom, description, schema_json, service_id) VALUES ($1,$2,$3,$4) RETURNING *`, [nom, description, JSON.stringify(schema_json), service_id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get form responses for a patient
router.get('/reponses/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT fr.*, f.nom as formulaire_nom, u.nom as rempli_nom, u.prenom as rempli_prenom FROM formulaire_reponses fr LEFT JOIN formulaires f ON fr.formulaire_id = f.id LEFT JOIN users u ON fr.rempli_par = u.id WHERE fr.patient_id = $1 ORDER BY fr.created_at DESC`, [req.params.patientId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Submit form response
router.post('/reponses', authenticate, validate(createReponseFormulaireSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { formulaire_id, patient_id, donnees_json } = req.body;
    const result = await query(`INSERT INTO formulaire_reponses (formulaire_id, patient_id, rempli_par, donnees_json) VALUES ($1,$2,$3,$4) RETURNING *`, [formulaire_id, patient_id, req.user!.id, JSON.stringify(donnees_json)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;