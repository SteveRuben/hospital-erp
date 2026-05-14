import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validate, createNoteSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/:patientId', authenticate, asyncHandler(async (req, res) => {
  const rows = await prisma.note.findMany({
    where: { patientId: Number(req.params.patientId) },
    include: { auteur: { select: { nom: true, prenom: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const mapped = rows.map(n => ({
    ...n,
    auteur_nom: n.auteur?.nom ?? null,
    auteur_prenom: n.auteur?.prenom ?? null,
    auteur_role: n.auteur?.role ?? null,
  }));
  res.json(mapped);
}));

router.post('/', authenticate, validate(createNoteSchema), asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest;
  const { patient_id, titre, contenu, type_note } = req.body;
  const created = await prisma.note.create({
    data: {
      patientId: Number(patient_id),
      auteurId: authReq.user!.id,
      titre: titre ?? null,
      contenu,
      typeNote: type_note || 'general',
    },
  });
  res.status(201).json(created);
}));

router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  try {
    await prisma.note.delete({ where: { id: Number(req.params.id) } });
  } catch { /* ignore */ }
  res.json({ message: 'Supprimé' });
}));

export default router;
