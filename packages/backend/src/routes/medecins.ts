import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createMedecinSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

// Get all doctors
router.get('/', authenticate, asyncHandler(async (_req, res) => {
  const result = await query('SELECT * FROM medecins ORDER BY nom, prenom');
  res.json(result.rows);
}));

// Get single doctor
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM medecins WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) { res.status(404).json({ error: 'Médecin non trouvé' }); return; }
  res.json(result.rows[0]);
}));

// Create doctor
router.post('/', authenticate, authorize('admin'), validate(createMedecinSchema), asyncHandler(async (req, res) => {
  const { nom, prenom, specialite, telephone } = req.body;
  const result = await query(
    'INSERT INTO medecins (nom, prenom, specialite, telephone) VALUES ($1, $2, $3, $4) RETURNING *',
    [nom, prenom, specialite, telephone]
  );
  res.status(201).json(result.rows[0]);
}));

// Update doctor
router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { nom, prenom, specialite, telephone } = req.body;
  const result = await query(
    'UPDATE medecins SET nom = $1, prenom = $2, specialite = $3, telephone = $4 WHERE id = $5 RETURNING *',
    [nom, prenom, specialite, telephone, req.params.id]
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Médecin non trouvé' }); return; }
  res.json(result.rows[0]);
}));

// Delete doctor
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM medecins WHERE id = $1 RETURNING *', [req.params.id]);
  if (result.rows.length === 0) { res.status(404).json({ error: 'Médecin non trouvé' }); return; }
  res.json({ message: 'Médecin supprimé' });
}));

export default router;
