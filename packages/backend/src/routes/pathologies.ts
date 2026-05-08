import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createPathologieSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/:patientId', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM pathologies WHERE patient_id = $1 ORDER BY date_debut DESC', [req.params.patientId]);
  res.json(result.rows);
}));

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createPathologieSchema), asyncHandler(async (req, res) => {
  const { patient_id, nom, code_cim, statut, date_debut, date_fin, notes } = req.body;
  const result = await query(
    `INSERT INTO pathologies (patient_id, nom, code_cim, statut, date_debut, date_fin, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [patient_id, nom, code_cim, statut, date_debut, date_fin, notes]
  );
  res.status(201).json(result.rows[0]);
}));

router.put('/:id', authenticate, authorize('admin', 'medecin'), asyncHandler(async (req, res) => {
  const { nom, code_cim, statut, date_debut, date_fin, notes } = req.body;
  const result = await query(
    'UPDATE pathologies SET nom=$1, code_cim=$2, statut=$3, date_debut=$4, date_fin=$5, notes=$6 WHERE id=$7 RETURNING *',
    [nom, code_cim, statut, date_debut, date_fin, notes, req.params.id]
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
  res.json(result.rows[0]);
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  await query('DELETE FROM pathologies WHERE id = $1', [req.params.id]);
  res.json({ message: 'Supprimé' });
}));

export default router;
