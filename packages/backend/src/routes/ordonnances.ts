import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT o.*, m.nom as medecin_nom, m.prenom as medecin_prenom FROM ordonnances o LEFT JOIN medecins m ON o.medecin_id = m.id WHERE o.patient_id = $1 ORDER BY o.date_ordonnance DESC`, [req.params.patientId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, consultation_id, notes } = req.body;
    const result = await query(`INSERT INTO ordonnances (patient_id, medecin_id, consultation_id, notes) VALUES ($1,$2,$3,$4) RETURNING *`, [patient_id, medecin_id, consultation_id, notes]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id/statut', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;
    const result = await query('UPDATE ordonnances SET statut = $1 WHERE id = $2 RETURNING *', [statut, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;