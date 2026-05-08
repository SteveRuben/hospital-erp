import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createAllergieSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/:patientId', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM allergies WHERE patient_id = $1 ORDER BY created_at DESC', [req.params.patientId]);
  res.json(result.rows);
}));

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createAllergieSchema), asyncHandler(async (req, res) => {
  const { patient_id, allergene, type_allergie, severite, reaction, date_debut } = req.body;
  const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
  const result = await query(
    `INSERT INTO allergies (patient_id, allergene, type_allergie, severite, reaction, date_debut) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [patient_id, allergene, n(type_allergie), n(severite), n(reaction), n(date_debut)]
  );
  res.status(201).json(result.rows[0]);
}));

router.put('/:id', authenticate, authorize('admin', 'medecin'), asyncHandler(async (req, res) => {
  const { allergene, type_allergie, severite, reaction, active } = req.body;
  const result = await query(
    'UPDATE allergies SET allergene=$1, type_allergie=$2, severite=$3, reaction=$4, active=$5 WHERE id=$6 RETURNING *',
    [allergene, type_allergie, severite, reaction, active, req.params.id]
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
  res.json(result.rows[0]);
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  await query('DELETE FROM allergies WHERE id = $1', [req.params.id]);
  res.json({ message: 'Supprimé' });
}));

export default router;
