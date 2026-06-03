import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createAllergieSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { requireResourceAccess } from '../middleware/resource-access.js';

const router = Router();

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const rows = await prisma.allergie.findMany({
    where: { patientId: Number(req.params.patientId) },
    orderBy: { createdAt: 'desc' },
  });
  // Mappe en snake_case : le brut renvoyait typeAllergie (camelCase) alors que
  // le frontend lit a.type_allergie -> la colonne Type restait vide.
  const mapped = rows.map(a => ({
    id: a.id,
    patient_id: a.patientId,
    allergene: a.allergene,
    type_allergie: a.typeAllergie,
    severite: a.severite,
    reaction: a.reaction,
    active: a.active,
    date_debut: a.dateDebut,
    created_at: a.createdAt,
  }));
  res.json(mapped);
}));

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createAllergieSchema), requirePatientAccess, asyncHandler(async (req, res) => {
  const { patient_id, allergene, type_allergie, severite, reaction, date_debut } = req.body;
  const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
  const created = await prisma.allergie.create({
    data: {
      patientId: Number(patient_id),
      allergene,
      typeAllergie: n(type_allergie) as string | null,
      severite: n(severite) as string | null,
      reaction: n(reaction) as string | null,
      dateDebut: date_debut ? new Date(date_debut) : null,
    },
  });
  res.status(201).json(created);
}));

router.put('/:id', authenticate, authorize('admin', 'medecin'), requireResourceAccess('allergie'), asyncHandler(async (req, res) => {
  const { allergene, type_allergie, severite, reaction, active } = req.body;
  try {
    const updated = await prisma.allergie.update({
      where: { id: Number(req.params.id) },
      data: { allergene, typeAllergie: type_allergie, severite, reaction, active },
    });
    res.json(updated);
  } catch {
    res.status(404).json({ error: 'Non trouvé' });
  }
}));

router.delete('/:id', authenticate, authorize('admin'), requireResourceAccess('allergie'), asyncHandler(async (req, res) => {
  try {
    await prisma.allergie.delete({ where: { id: Number(req.params.id) } });
  } catch { /* ignore */ }
  res.json({ message: 'Supprimé' });
}));

export default router;
