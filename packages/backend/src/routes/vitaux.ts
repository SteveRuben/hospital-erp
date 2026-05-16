import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createVitalSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { requireResourceAccess } from '../middleware/resource-access.js';

const router = Router();

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const rows = await prisma.vital.findMany({
    where: { patientId: Number(req.params.patientId) },
    include: { medecin: { select: { nom: true, prenom: true } } },
    orderBy: { dateMesure: 'desc' },
  });
  // Flatten medecin to mirror the prior LEFT JOIN shape (medecin_nom / medecin_prenom)
  const mapped = rows.map(v => ({
    ...v,
    medecin_nom: v.medecin?.nom ?? null,
    medecin_prenom: v.medecin?.prenom ?? null,
  }));
  res.json(mapped);
}));

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createVitalSchema), requirePatientAccess, asyncHandler(async (req, res) => {
  const { patient_id, medecin_id, temperature, tension_systolique, tension_diastolique, pouls, frequence_respiratoire, saturation_o2, poids, taille, glycemie, notes } = req.body;
  const created = await prisma.vital.create({
    data: {
      patientId: Number(patient_id),
      medecinId: medecin_id ?? null,
      temperature: temperature ?? null,
      tensionSystolique: tension_systolique ?? null,
      tensionDiastolique: tension_diastolique ?? null,
      pouls: pouls ?? null,
      frequenceRespiratoire: frequence_respiratoire ?? null,
      saturationO2: saturation_o2 ?? null,
      poids: poids ?? null,
      taille: taille ?? null,
      glycemie: glycemie ?? null,
      notes: notes ?? null,
    },
  });
  res.status(201).json(created);
}));

router.delete('/:id', authenticate, authorize('admin'), requireResourceAccess('vital'), asyncHandler(async (req, res) => {
  try {
    await prisma.vital.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Supprimé' });
  } catch {
    res.status(404).json({ error: 'Non trouvé' });
  }
}));

export default router;
