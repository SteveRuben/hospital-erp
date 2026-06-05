import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createVitalSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { requireResourceAccess } from '../middleware/resource-access.js';

const router = Router();

// Mappe un signe vital Prisma (camelCase) vers le snake_case attendu par le
// frontend. Source unique pour GET/POST — évite la divergence (un champ
// renvoyé au GET mais oublié au POST, comme saturationO2 auparavant).
type VitalRow = NonNullable<Awaited<ReturnType<typeof prisma.vital.findFirst>>>;
function toVitalDTO(v: VitalRow & { medecin?: { nom: string | null; prenom: string | null } | null }) {
  return {
    id: v.id,
    patient_id: v.patientId,
    medecin_id: v.medecinId,
    temperature: v.temperature,
    tension_systolique: v.tensionSystolique,
    tension_diastolique: v.tensionDiastolique,
    pouls: v.pouls,
    frequence_respiratoire: v.frequenceRespiratoire,
    saturation_o2: v.saturationO2,
    poids: v.poids,
    taille: v.taille,
    glycemie: v.glycemie,
    notes: v.notes,
    date_mesure: v.dateMesure,
    created_at: v.createdAt,
    medecin_nom: v.medecin?.nom ?? null,
    medecin_prenom: v.medecin?.prenom ?? null,
  };
}

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const rows = await prisma.vital.findMany({
    where: { patientId: Number(req.params.patientId) },
    include: { medecin: { select: { nom: true, prenom: true } } },
    orderBy: { dateMesure: 'desc' },
  });
  res.json(rows.map(toVitalDTO));
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
  res.status(201).json(toVitalDTO(created));
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
