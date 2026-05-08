import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createVitalSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/:patientId', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT v.*, m.nom as medecin_nom, m.prenom as medecin_prenom FROM vitaux v LEFT JOIN medecins m ON v.medecin_id = m.id WHERE v.patient_id = $1 ORDER BY v.date_mesure DESC',
    [req.params.patientId]
  );
  res.json(result.rows);
}));

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createVitalSchema), asyncHandler(async (req, res) => {
  const { patient_id, medecin_id, temperature, tension_systolique, tension_diastolique, pouls, frequence_respiratoire, saturation_o2, poids, taille, glycemie, notes } = req.body;
  const result = await query(
    `INSERT INTO vitaux (patient_id, medecin_id, temperature, tension_systolique, tension_diastolique, pouls, frequence_respiratoire, saturation_o2, poids, taille, glycemie, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [patient_id, medecin_id, temperature, tension_systolique, tension_diastolique, pouls, frequence_respiratoire, saturation_o2, poids, taille, glycemie, notes]
  );
  res.status(201).json(result.rows[0]);
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM vitaux WHERE id = $1 RETURNING *', [req.params.id]);
  if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
  res.json({ message: 'Supprimé' });
}));

export default router;
