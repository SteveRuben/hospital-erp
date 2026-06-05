import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createAllergieSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { requireResourceAccess } from '../middleware/resource-access.js';

const router = Router();

// Mappe une allergie Prisma (camelCase) vers le snake_case du frontend.
// Source unique pour GET/POST/PUT (le brut renvoyait typeAllergie -> colonne
// Type vide).
type AllergieRow = NonNullable<Awaited<ReturnType<typeof prisma.allergie.findFirst>>>;
function toAllergieDTO(a: AllergieRow) {
  return {
    id: a.id,
    patient_id: a.patientId,
    allergene: a.allergene,
    type_allergie: a.typeAllergie,
    severite: a.severite,
    reaction: a.reaction,
    active: a.active,
    date_debut: a.dateDebut,
    created_at: a.createdAt,
  };
}

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const rows = await prisma.allergie.findMany({
    where: { patientId: Number(req.params.patientId) },
    orderBy: { createdAt: 'desc' },
  });
  res.json(rows.map(toAllergieDTO));
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
  res.status(201).json(toAllergieDTO(created));
}));

router.put('/:id', authenticate, authorize('admin', 'medecin'), requireResourceAccess('allergie'), asyncHandler(async (req, res) => {
  const { allergene, type_allergie, severite, reaction, active } = req.body;
  try {
    const updated = await prisma.allergie.update({
      where: { id: Number(req.params.id) },
      data: { allergene, typeAllergie: type_allergie, severite, reaction, active },
    });
    res.json(toAllergieDTO(updated));
  } catch {
    res.status(404).json({ error: 'Non trouvé' });
  }
}));

router.delete('/:id', authenticate, authorize('admin'), requireResourceAccess('allergie'), asyncHandler(async (req, res) => {
  try {
    await prisma.allergie.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Supprimé' });
  } catch (err: any) {
    if (err?.code === 'P2025') { res.status(404).json({ error: 'Allergie non trouvée' }); return; }
    if (err?.code === 'P2003') { res.status(409).json({ error: 'Suppression impossible : des données sont rattachées à cette allergie' }); return; }
    throw err;
  }
}));

export default router;
