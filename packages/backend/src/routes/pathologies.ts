import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createPathologieSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';

const router = Router();

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const rows = await prisma.pathologie.findMany({
    where: { patientId: Number(req.params.patientId) },
    orderBy: { dateDebut: 'desc' },
  });
  res.json(rows);
}));

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createPathologieSchema), requirePatientAccess, asyncHandler(async (req, res) => {
  const { patient_id, nom, code_cim, statut, date_debut, date_fin, notes } = req.body;
  const created = await prisma.pathologie.create({
    data: {
      patientId: patient_id,
      nom,
      codeCim: code_cim,
      statut,
      dateDebut: date_debut ? new Date(date_debut) : null,
      dateFin: date_fin ? new Date(date_fin) : null,
      notes,
    },
  });
  res.status(201).json(created);
}));

router.put('/:id', authenticate, authorize('admin', 'medecin'), asyncHandler(async (req, res) => {
  const { nom, code_cim, statut, date_debut, date_fin, notes } = req.body;
  try {
    const updated = await prisma.pathologie.update({
      where: { id: Number(req.params.id) },
      data: {
        nom,
        codeCim: code_cim,
        statut,
        dateDebut: date_debut ? new Date(date_debut) : null,
        dateFin: date_fin ? new Date(date_fin) : null,
        notes,
      },
    });
    res.json(updated);
  } catch {
    res.status(404).json({ error: 'Non trouvé' });
  }
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  try {
    await prisma.pathologie.delete({ where: { id: Number(req.params.id) } });
  } catch { /* ignore not found */ }
  res.json({ message: 'Supprimé' });
}));

export default router;
