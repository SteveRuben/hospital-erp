import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createVaccinationSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { requireResourceAccess } from '../middleware/resource-access.js';
import { billVaccination } from '../services/billing.js';

const router = Router();

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const rows = await prisma.vaccination.findMany({
    where: { patientId: Number(req.params.patientId) },
    include: { medecin: { select: { nom: true, prenom: true } } },
    orderBy: { dateVaccination: 'desc' },
  });
  const mapped = rows.map(v => ({
    ...v,
    medecin_nom: v.medecin?.nom ?? null,
    medecin_prenom: v.medecin?.prenom ?? null,
  }));
  res.json(mapped);
}));

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createVaccinationSchema), requirePatientAccess, asyncHandler(async (req: AuthRequest, res) => {
  const { patient_id, medecin_id, vaccin, lot, dose, montant, site_injection, date_vaccination, date_rappel, notes } = req.body;
  const data: Parameters<typeof prisma.vaccination.create>[0]['data'] = {
    patientId: Number(patient_id),
    medecinId: medecin_id ?? null,
    vaccin,
    lot: lot ?? null,
    dose: dose ?? null,
    montant: montant != null ? Number(montant) : null,
    siteInjection: site_injection ?? null,
    notes: notes ?? null,
  };
  if (date_vaccination) data.dateVaccination = new Date(date_vaccination);
  if (date_rappel) data.dateRappel = new Date(date_rappel);
    const created = await prisma.vaccination.create({ data });
    if (created.montant && Number(created.montant) > 0) {
      billVaccination({
        patientId: created.patientId,
        montant: Number(created.montant),
        sourceId: created.id,
        userId: req.user!.id,
      }).catch(err => console.error('[BILLING] Vaccination billing failed:', err));
    }
    res.status(201).json(created);
}));

router.delete('/:id', authenticate, authorize('admin'), requireResourceAccess('vaccination'), asyncHandler(async (req, res) => {
  try {
    await prisma.vaccination.delete({ where: { id: Number(req.params.id) } });
  } catch { /* ignore */ }
  res.json({ message: 'Supprimé' });
}));

export default router;
