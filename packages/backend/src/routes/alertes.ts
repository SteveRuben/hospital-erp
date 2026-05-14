import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validate, createAlerteSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/:patientId', authenticate, asyncHandler(async (req, res) => {
  const { active } = req.query;
  const where: Prisma.AlerteWhereInput = { patientId: Number(req.params.patientId) };
  if (active === 'true') where.active = true;
  const rows = await prisma.alerte.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { creator: { select: { nom: true, prenom: true } } },
  });
  res.json(rows.map(r => ({
    ...r,
    created_nom: r.creator?.nom ?? null,
    created_prenom: r.creator?.prenom ?? null,
  })));
}));

router.post('/', authenticate, validate(createAlerteSchema), asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest;
  const { patient_id, type_alerte, message, severite } = req.body;
  const created = await prisma.alerte.create({
    data: {
      patientId: patient_id,
      typeAlerte: type_alerte,
      message,
      severite: severite || 'info',
      createdBy: authReq.user!.id,
    },
  });
  res.status(201).json(created);
}));

router.put('/:id/toggle', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = await prisma.alerte.findUnique({ where: { id }, select: { active: true } });
  if (!current) { res.status(404).json({ error: 'Non trouvé' }); return; }
  const updated = await prisma.alerte.update({ where: { id }, data: { active: !current.active } });
  res.json(updated);
}));

router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  try {
    await prisma.alerte.delete({ where: { id: Number(req.params.id) } });
  } catch { /* ignore not found */ }
  res.json({ message: 'Supprimé' });
}));

export default router;
