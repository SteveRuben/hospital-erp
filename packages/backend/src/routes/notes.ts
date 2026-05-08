import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validate, createNoteSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/:patientId', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT n.*, u.nom as auteur_nom, u.prenom as auteur_prenom, u.role as auteur_role FROM notes n LEFT JOIN users u ON n.auteur_id = u.id WHERE n.patient_id = $1 ORDER BY n.created_at DESC`,
    [req.params.patientId]
  );
  res.json(result.rows);
}));

router.post('/', authenticate, validate(createNoteSchema), asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest;
  const { patient_id, titre, contenu, type_note } = req.body;
  const result = await query(
    `INSERT INTO notes (patient_id, auteur_id, titre, contenu, type_note) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [patient_id, authReq.user!.id, titre, contenu, type_note || 'general']
  );
  res.status(201).json(result.rows[0]);
}));

router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  await query('DELETE FROM notes WHERE id = $1', [req.params.id]);
  res.json({ message: 'Supprimé' });
}));

export default router;
