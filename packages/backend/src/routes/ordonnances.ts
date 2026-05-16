import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createOrdonnanceSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';

const router = Router();

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const rows = await prisma.ordonnance.findMany({
    where: { patientId: Number(req.params.patientId) },
    include: { medecin: { select: { nom: true, prenom: true } } },
    orderBy: { dateOrdonnance: 'desc' },
  });
  const mapped = rows.map(o => ({
    ...o,
    medecin_nom: o.medecin?.nom ?? null,
    medecin_prenom: o.medecin?.prenom ?? null,
  }));
  res.json(mapped);
}));

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createOrdonnanceSchema), requirePatientAccess, asyncHandler(async (req, res) => {
  const { patient_id, medecin_id, consultation_id, notes } = req.body;
  const created = await prisma.ordonnance.create({
    data: {
      patientId: Number(patient_id),
      medecinId: medecin_id ?? null,
      consultationId: consultation_id ?? null,
      notes: notes ?? null,
    },
  });
  res.status(201).json(created);
}));

router.put('/:id/statut', authenticate, asyncHandler(async (req, res) => {
  const { statut } = req.body;
  try {
    const updated = await prisma.ordonnance.update({
      where: { id: Number(req.params.id) },
      data: { statut },
    });
    res.json(updated);
  } catch {
    res.status(404).json({ error: 'Non trouvé' });
  }
}));

export default router;
