import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createVaccinationSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/:patientId', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT v.*, m.nom as medecin_nom, m.prenom as medecin_prenom FROM vaccinations v LEFT JOIN medecins m ON v.medecin_id = m.id WHERE v.patient_id = $1 ORDER BY v.date_vaccination DESC`,
    [req.params.patientId]
  );
  res.json(result.rows);
}));

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createVaccinationSchema), asyncHandler(async (req, res) => {
  const { patient_id, medecin_id, vaccin, lot, dose, site_injection, date_vaccination, date_rappel, notes } = req.body;
  const result = await query(
    `INSERT INTO vaccinations (patient_id, medecin_id, vaccin, lot, dose, site_injection, date_vaccination, date_rappel, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [patient_id, medecin_id, vaccin, lot, dose, site_injection, date_vaccination, date_rappel, notes]
  );
  res.status(201).json(result.rows[0]);
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  await query('DELETE FROM vaccinations WHERE id = $1', [req.params.id]);
  res.json({ message: 'Supprimé' });
}));

export default router;
