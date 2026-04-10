import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM pathologies WHERE patient_id = $1 ORDER BY date_debut DESC', [req.params.patientId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, nom, code_cim, statut, date_debut, date_fin, notes } = req.body;
    const result = await query(`INSERT INTO pathologies (patient_id, nom, code_cim, statut, date_debut, date_fin, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [patient_id, nom, code_cim, statut, date_debut, date_fin, notes]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code_cim, statut, date_debut, date_fin, notes } = req.body;
    const result = await query('UPDATE pathologies SET nom=$1, code_cim=$2, statut=$3, date_debut=$4, date_fin=$5, notes=$6 WHERE id=$7 RETURNING *', [nom, code_cim, statut, date_debut, date_fin, notes, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try { await query('DELETE FROM pathologies WHERE id = $1', [req.params.id]); res.json({ message: 'Supprimé' }); }
  catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;