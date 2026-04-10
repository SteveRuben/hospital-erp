import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM services ORDER BY nom');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const service = await query('SELECT * FROM services WHERE id = $1', [req.params.id]);
    if (service.rows.length === 0) { res.status(404).json({ error: 'Service non trouvé' }); return; }
    const stats = await query(`SELECT COUNT(DISTINCT c.id) as nb_consultations, COUNT(DISTINCT c.patient_id) as nb_patients, COALESCE(SUM(r.montant), 0) as recettes FROM consultations c LEFT JOIN recettes r ON r.service_id = c.service_id WHERE c.service_id = $1`, [req.params.id]);
    res.json({ ...service.rows[0], stats: stats.rows[0] });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, description } = req.body;
    const result = await query('INSERT INTO services (nom, description) VALUES ($1, $2) RETURNING *', [nom, description]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, description } = req.body;
    const result = await query('UPDATE services SET nom = $1, description = $2 WHERE id = $3 RETURNING *', [nom, description, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Service non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('DELETE FROM services WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Service non trouvé' }); return; }
    res.json({ message: 'Service supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;