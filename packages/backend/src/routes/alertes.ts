import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { active } = req.query;
    let sql = 'SELECT a.*, u.nom as created_nom, u.prenom as created_prenom FROM alertes a LEFT JOIN users u ON a.created_by = u.id WHERE a.patient_id = $1';
    const params: unknown[] = [req.params.patientId];
    if (active === 'true') { sql += ' AND a.active = TRUE'; }
    sql += ' ORDER BY a.created_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, type_alerte, message, severite } = req.body;
    const result = await query(`INSERT INTO alertes (patient_id, type_alerte, message, severite, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [patient_id, type_alerte, message, severite || 'info', req.user!.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id/toggle', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('UPDATE alertes SET active = NOT active WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try { await query('DELETE FROM alertes WHERE id = $1', [req.params.id]); res.json({ message: 'Supprimé' }); }
  catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;