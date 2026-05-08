import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createOrdonnanceSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/:patientId', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT o.*, m.nom as medecin_nom, m.prenom as medecin_prenom FROM ordonnances o LEFT JOIN medecins m ON o.medecin_id = m.id WHERE o.patient_id = $1 ORDER BY o.date_ordonnance DESC`,
    [req.params.patientId]
  );
  res.json(result.rows);
}));

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createOrdonnanceSchema), asyncHandler(async (req, res) => {
  const { patient_id, medecin_id, consultation_id, notes } = req.body;
  const result = await query(
    `INSERT INTO ordonnances (patient_id, medecin_id, consultation_id, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
    [patient_id, medecin_id, consultation_id, notes]
  );
  res.status(201).json(result.rows[0]);
}));

router.put('/:id/statut', authenticate, asyncHandler(async (req, res) => {
  const { statut } = req.body;
  const result = await query('UPDATE ordonnances SET statut = $1 WHERE id = $2 RETURNING *', [statut, req.params.id]);
  if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
  res.json(result.rows[0]);
}));

export default router;
