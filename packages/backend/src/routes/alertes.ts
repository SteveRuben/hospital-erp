import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validate, createAlerteSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/:patientId', authenticate, asyncHandler(async (req, res) => {
  const { active } = req.query;
  let sql = 'SELECT a.*, u.nom as created_nom, u.prenom as created_prenom FROM alertes a LEFT JOIN users u ON a.created_by = u.id WHERE a.patient_id = $1';
  const params: unknown[] = [req.params.patientId];
  if (active === 'true') { sql += ' AND a.active = TRUE'; }
  sql += ' ORDER BY a.created_at DESC';
  const result = await query(sql, params);
  res.json(result.rows);
}));

router.post('/', authenticate, validate(createAlerteSchema), asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest;
  const { patient_id, type_alerte, message, severite } = req.body;
  const result = await query(
    `INSERT INTO alertes (patient_id, type_alerte, message, severite, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [patient_id, type_alerte, message, severite || 'info', authReq.user!.id]
  );
  res.status(201).json(result.rows[0]);
}));

router.put('/:id/toggle', authenticate, asyncHandler(async (req, res) => {
  const result = await query('UPDATE alertes SET active = NOT active WHERE id = $1 RETURNING *', [req.params.id]);
  if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
  res.json(result.rows[0]);
}));

router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  await query('DELETE FROM alertes WHERE id = $1', [req.params.id]);
  res.json({ message: 'Supprimé' });
}));

export default router;
