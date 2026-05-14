import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createMedecinSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

// Get all doctors
router.get('/', authenticate, asyncHandler(async (_req, res) => {
  const rows = await prisma.medecin.findMany({ orderBy: [{ nom: 'asc' }, { prenom: 'asc' }] });
  res.json(rows);
}));

// Get single doctor
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const row = await prisma.medecin.findUnique({ where: { id: Number(req.params.id) } });
  if (!row) { res.status(404).json({ error: 'Médecin non trouvé' }); return; }
  res.json(row);
}));

// Create doctor
router.post('/', authenticate, authorize('admin'), validate(createMedecinSchema), asyncHandler(async (req, res) => {
  const { nom, prenom, specialite, telephone } = req.body;
  const created = await prisma.medecin.create({ data: { nom, prenom, specialite, telephone } });
  res.status(201).json(created);
}));

// Update doctor
router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { nom, prenom, specialite, telephone } = req.body;
  try {
    const updated = await prisma.medecin.update({
      where: { id: Number(req.params.id) },
      data: { nom, prenom, specialite, telephone },
    });
    res.json(updated);
  } catch {
    res.status(404).json({ error: 'Médecin non trouvé' });
  }
}));

// Delete doctor
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  try {
    await prisma.medecin.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Médecin supprimé' });
  } catch {
    res.status(404).json({ error: 'Médecin non trouvé' });
  }
}));

export default router;
