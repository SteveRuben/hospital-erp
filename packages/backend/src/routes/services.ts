import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createServiceSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/', authenticate, asyncHandler(async (_req, res) => {
  const services = await prisma.service.findMany({ orderBy: { nom: 'asc' } });
  res.json(services);
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) { res.status(404).json({ error: 'Service non trouvé' }); return; }
  const stats = await prisma.$queryRaw<Array<{ nb_consultations: bigint; nb_patients: bigint; recettes: string | number }>>`
    SELECT COUNT(DISTINCT c.id)::bigint as nb_consultations,
           COUNT(DISTINCT c.patient_id)::bigint as nb_patients,
           COALESCE(SUM(r.montant), 0) as recettes
    FROM consultations c
    LEFT JOIN recettes r ON r.service_id = c.service_id
    WHERE c.service_id = ${id}
  `;
  const s = stats[0] || { nb_consultations: 0n, nb_patients: 0n, recettes: 0 };
  res.json({
    ...service,
    stats: {
      nb_consultations: Number(s.nb_consultations),
      nb_patients: Number(s.nb_patients),
      recettes: Number(s.recettes),
    },
  });
}));

router.post('/', authenticate, authorize('admin'), validate(createServiceSchema), asyncHandler(async (req, res) => {
  const { nom, description } = req.body;
  const created = await prisma.service.create({ data: { nom, description } });
  res.status(201).json(created);
}));

router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { nom, description } = req.body;
  try {
    const updated = await prisma.service.update({ where: { id }, data: { nom, description } });
    res.json(updated);
  } catch {
    res.status(404).json({ error: 'Service non trouvé' });
  }
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.service.delete({ where: { id } });
    res.json({ message: 'Service supprimé' });
  } catch {
    res.status(404).json({ error: 'Service non trouvé' });
  }
}));

export default router;
