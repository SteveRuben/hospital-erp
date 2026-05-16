import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createVisiteSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Prisma } from '@prisma/client';

const router = Router();

// Get active visits
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { statut = 'active', service_id } = req.query;
  const statutStr = String(statut);
  const serviceFilter = service_id ? Prisma.sql`AND v.service_id = ${Number(service_id)}` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT v.*,
           p.nom as patient_nom, p.prenom as patient_prenom, p.sexe, p.telephone as patient_telephone,
           s.nom as service_nom
    FROM visites v
    LEFT JOIN patients p ON v.patient_id = p.id
    LEFT JOIN services s ON v.service_id = s.id
    WHERE v.statut = ${statutStr}
    ${serviceFilter}
    ORDER BY v.date_debut DESC
  `;
  res.json(rows);
}));

// Start visit
router.post('/', authenticate, authorize('admin', 'medecin', 'reception'), validate(createVisiteSchema), asyncHandler(async (req, res) => {
  const { patient_id, service_id, type_visite, notes } = req.body;
  if (!patient_id) { res.status(400).json({ error: 'Patient requis' }); return; }
  const existing = await prisma.visite.findFirst({ where: { patientId: Number(patient_id), statut: 'active' }, select: { id: true } });
  if (existing) { res.status(400).json({ error: 'Ce patient a déjà une visite active' }); return; }
  const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
  const created = await prisma.visite.create({
    data: {
      patientId: Number(patient_id),
      serviceId: n(service_id) as number | null,
      typeVisite: (n(type_visite) as string | null) || 'ambulatoire',
      notes: n(notes) as string | null,
    },
  });
  res.status(201).json(created);
}));

// End visit
router.put('/:id/terminer', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const result = await prisma.visite.updateMany({
    where: { id, statut: 'active' },
    data: { statut: 'terminee', dateFin: new Date() },
  });
  if (result.count === 0) { res.status(404).json({ error: 'Visite non trouvée ou déjà terminée' }); return; }
  const updated = await prisma.visite.findUnique({ where: { id } });
  res.json(updated);
}));

// Stats
router.get('/stats', authenticate, asyncHandler(async (_req, res) => {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
  const actives = await prisma.visite.count({ where: { statut: 'active' } });
  const today = await prisma.visite.count({ where: { dateDebut: { gte: startOfDay, lte: endOfDay } } });
  const parService = await prisma.$queryRaw<Array<{ nom: string; total: bigint }>>`
    SELECT s.nom, COUNT(v.id)::bigint as total
    FROM services s
    LEFT JOIN visites v ON v.service_id = s.id AND v.statut = 'active'
    GROUP BY s.id, s.nom
    ORDER BY total DESC
  `;
  const parType = await prisma.$queryRaw<Array<{ type_visite: string; total: bigint }>>`
    SELECT type_visite, COUNT(*)::bigint as total
    FROM visites
    WHERE statut = 'active'
    GROUP BY type_visite
  `;
  res.json({
    actives,
    today,
    parService: parService.map(r => ({ nom: r.nom, total: Number(r.total) })),
    parType: parType.map(r => ({ type_visite: r.type_visite, total: Number(r.total) })),
  });
}));

export default router;
