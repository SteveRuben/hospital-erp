import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createPrescriptionSchema } from '../middleware/validation.js';

const router = Router();

router.get('/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT p.*, m.nom as medecin_nom, m.prenom as medecin_prenom FROM prescriptions p LEFT JOIN medecins m ON p.medecin_id = m.id WHERE p.patient_id = $1 ORDER BY p.created_at DESC`, [req.params.patientId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createPrescriptionSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, consultation_id, medicament, dosage, frequence, duree, voie, instructions, date_debut, date_fin } = req.body;
    const result = await query(`INSERT INTO prescriptions (patient_id, medecin_id, consultation_id, medicament, dosage, frequence, duree, voie, instructions, date_debut, date_fin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [patient_id, medecin_id, consultation_id, medicament, dosage, frequence, duree, voie, instructions, date_debut, date_fin]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id/statut', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;
    const result = await query('UPDATE prescriptions SET statut = $1 WHERE id = $2 RETURNING *', [statut, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try { await query('DELETE FROM prescriptions WHERE id = $1', [req.params.id]); res.json({ message: 'Supprimé' }); }
  catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;