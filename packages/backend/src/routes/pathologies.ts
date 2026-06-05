import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createPathologieSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { requireResourceAccess } from '../middleware/resource-access.js';

const router = Router();

// Mappe une pathologie Prisma (camelCase) vers le snake_case lu par le
// frontend (code_cim, date_debut...). Sans ça, GET/POST renvoyaient du brut
// et les colonnes CIM / dates restaient vides (même bug que vitaux/allergies).
type PathologieRow = Awaited<ReturnType<typeof prisma.pathologie.findFirst>>;
function toPathologieDTO(p: NonNullable<PathologieRow>) {
  return {
    id: p.id,
    patient_id: p.patientId,
    nom: p.nom,
    code_cim: p.codeCim,
    statut: p.statut,
    date_debut: p.dateDebut,
    date_fin: p.dateFin,
    notes: p.notes,
    created_at: p.createdAt,
  };
}

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const rows = await prisma.pathologie.findMany({
    where: { patientId: Number(req.params.patientId) },
    orderBy: { dateDebut: 'desc' },
  });
  res.json(rows.map(toPathologieDTO));
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
  res.status(201).json(toPathologieDTO(created));
}));

router.put('/:id', authenticate, authorize('admin', 'medecin'), requireResourceAccess('pathologie'), asyncHandler(async (req, res) => {
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
    res.json(toPathologieDTO(updated));
  } catch {
    res.status(404).json({ error: 'Non trouvé' });
  }
}));

router.delete('/:id', authenticate, authorize('admin'), requireResourceAccess('pathologie'), asyncHandler(async (req, res) => {
  try {
    await prisma.pathologie.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Supprimé' });
  } catch (err: any) {
    if (err?.code === 'P2025') { res.status(404).json({ error: 'Pathologie non trouvée' }); return; }
    if (err?.code === 'P2003') { res.status(409).json({ error: 'Suppression impossible : des données sont rattachées à cette pathologie' }); return; }
    throw err;
  }
}));

export default router;
