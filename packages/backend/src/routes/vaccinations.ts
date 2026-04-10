import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT v.*, m.nom as medecin_nom, m.prenom as medecin_prenom FROM vaccinations v LEFT JOIN medecins m ON v.medecin_id = m.id WHERE v.patient_id = $1 ORDER BY v.date_vaccination DESC`, [req.params.patientId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, vaccin, lot, dose, site_injection, date_vaccination, date_rappel, notes } = req.body;
    const result = await query(`INSERT INTO vaccinations (patient_id, medecin_id, vaccin, lot, dose, site_injection, date_vaccination, date_rappel, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [patient_id, medecin_id, vaccin, lot, dose, site_injection, date_vaccination, date_rappel, notes]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try { await query('DELETE FROM vaccinations WHERE id = $1', [req.params.id]); res.json({ message: 'Supprimé' }); }
  catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;