import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createListePatientsSchema, addPatientToListeSchema } from '../middleware/validation.js';

const router = Router();

// Get all lists
router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT lp.*, u.nom as created_nom, u.prenom as created_prenom, (SELECT COUNT(*) FROM liste_patient_membres lpm WHERE lpm.liste_id = lp.id) as nb_patients FROM listes_patients lp LEFT JOIN users u ON lp.created_by = u.id ORDER BY lp.created_at DESC`);
    res.json(result.rows);
  } catch (err) { console.error('[ERROR] Get listes:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get single list with members
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const liste = await query('SELECT * FROM listes_patients WHERE id = $1', [req.params.id]);
    if (liste.rows.length === 0) { res.status(404).json({ error: 'Liste non trouvée' }); return; }
    const membres = await query(`SELECT lpm.*, p.nom, p.prenom, p.sexe, p.telephone, p.date_naissance, p.ville FROM liste_patient_membres lpm LEFT JOIN patients p ON lpm.patient_id = p.id WHERE lpm.liste_id = $1 ORDER BY lpm.added_at DESC`, [req.params.id]);
    res.json({ ...liste.rows[0], patients: membres.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create list
router.post('/', authenticate, validate(createListePatientsSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, description } = req.body;
    if (!nom) { res.status(400).json({ error: 'Nom requis' }); return; }
    const result = await query('INSERT INTO listes_patients (nom, description, created_by) VALUES ($1,$2,$3) RETURNING *', [nom, description || null, req.user!.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Delete list
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await query('DELETE FROM liste_patient_membres WHERE liste_id = $1', [req.params.id]);
    await query('DELETE FROM listes_patients WHERE id = $1', [req.params.id]);
    res.json({ message: 'Liste supprimée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Add patient to list
router.post('/:id/patients', authenticate, validate(addPatientToListeSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.body;
    if (!patient_id) { res.status(400).json({ error: 'Patient requis' }); return; }
    const existing = await query('SELECT id FROM liste_patient_membres WHERE liste_id = $1 AND patient_id = $2', [req.params.id, patient_id]);
    if (existing.rows.length > 0) { res.status(400).json({ error: 'Patient déjà dans la liste' }); return; }
    const result = await query('INSERT INTO liste_patient_membres (liste_id, patient_id) VALUES ($1,$2) RETURNING *', [req.params.id, patient_id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Remove patient from list
router.delete('/:id/patients/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await query('DELETE FROM liste_patient_membres WHERE liste_id = $1 AND patient_id = $2', [req.params.id, req.params.patientId]);
    res.json({ message: 'Patient retiré' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;