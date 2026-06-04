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
  // Mappe en snake_case attendu par le frontend. Le spread brut renvoyait du
  // camelCase Prisma (saturationO2, tensionSystolique, dateMesure...) -> SpO2,
  // TA et date n'apparaissaient pas dans l'onglet Signes vitaux.
  const mapped = rows.map(v => ({
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
  const mapped = {
    id: created.id,
    patient_id: created.patientId,
    medecin_id: created.medecinId,
    temperature: created.temperature,
    tension_systolique: created.tensionSystolique,
    tension_diastolique: created.tensionDiastolique,
    pouls: created.pouls,
    frequence_respiratoire: created.frequenceRespiratoire,
    saturation_o2: created.saturationO2,
    poids: created.poids,
    taille: created.taille,
    glycemie: created.glycemie,
    notes: created.notes,
    date_mesure: created.dateMesure,
    created_at: created.createdAt,
  };
  res.status(201).json(mapped);
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
