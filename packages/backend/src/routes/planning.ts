import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createPlanningSchema, createBlocageSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

// Get planning for a medecin
router.get('/medecin/:medecinId', authenticate, asyncHandler(async (req, res) => {
  const medecinId = Number(req.params.medecinId);
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT p.*, s.nom as service_nom
    FROM planning_medecins p
    LEFT JOIN services s ON p.service_id = s.id
    WHERE p.medecin_id = ${medecinId} AND p.actif = TRUE
    ORDER BY p.jour_semaine, p.heure_debut
  `;
  res.json(rows);
}));

// Create planning slot
router.post('/', authenticate, authorize('admin', 'medecin'), validate(createPlanningSchema), asyncHandler(async (req, res) => {
  const { medecin_id, service_id, jour_semaine, heure_debut, heure_fin, duree_creneau } = req.body;
  const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
  const toTime = (s: string) => {
    const [h, m, sec = '0'] = s.split(':');
    return new Date(Date.UTC(1970, 0, 1, Number(h), Number(m), Number(sec)));
  };
  const created = await prisma.planningMedecin.create({
    data: {
      medecinId: Number(medecin_id),
      serviceId: n(service_id) as number | null,
      jourSemaine: Number(jour_semaine),
      heureDebut: toTime(heure_debut),
      heureFin: toTime(heure_fin),
      dureeCreneau: duree_creneau || 30,
    },
  });
  res.status(201).json(created);
}));

// Delete planning slot (soft delete via actif=false)
router.delete('/:id', authenticate, authorize('admin', 'medecin'), asyncHandler(async (req, res) => {
  await prisma.planningMedecin.update({ where: { id: Number(req.params.id) }, data: { actif: false } }).catch(() => undefined);
  res.json({ message: 'Supprimé' });
}));

// Get blocages for a medecin
router.get('/blocages/:medecinId', authenticate, asyncHandler(async (req, res) => {
  const medecinId = Number(req.params.medecinId);
  const blocages = await prisma.planningBlocage.findMany({
    where: { medecinId, dateFin: { gte: new Date() } },
    orderBy: { dateDebut: 'asc' },
  });
  res.json(blocages);
}));

// Create blocage
router.post('/blocages', authenticate, authorize('admin', 'medecin'), validate(createBlocageSchema), asyncHandler(async (req, res) => {
  const { medecin_id, date_debut, date_fin, motif } = req.body;
  const created = await prisma.planningBlocage.create({
    data: {
      medecinId: Number(medecin_id),
      dateDebut: new Date(date_debut),
      dateFin: new Date(date_fin),
      motif: motif || null,
    },
  });
  res.status(201).json(created);
}));

// Get available slots for a date + medecin (uses planning)
router.get('/creneaux-disponibles', authenticate, asyncHandler(async (req, res) => {
  const { medecin_id, date } = req.query;
  if (!medecin_id || !date) { res.status(400).json({ error: 'medecin_id et date requis' }); return; }

  const medId = Number(medecin_id);
  const dateStr = String(date);
  const d = new Date(dateStr);
  const jourSemaine = d.getDay();

  const planning = await prisma.planningMedecin.findMany({
    where: { medecinId: medId, jourSemaine, actif: true },
  });
  if (planning.length === 0) { res.json([]); return; }

  const blocages = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM planning_blocages
    WHERE medecin_id = ${medId}
      AND ${dateStr}::date BETWEEN DATE(date_debut) AND DATE(date_fin)
  `;
  if (blocages.length > 0) { res.json([]); return; }

  const existingRdv = await prisma.$queryRaw<Array<{ date_rdv: Date }>>`
    SELECT date_rdv FROM rendez_vous
    WHERE medecin_id = ${medId}
      AND DATE(date_rdv) = ${dateStr}::date
      AND statut NOT IN ('annule', 'absent')
  `;
  const takenSlots = existingRdv.map((r) => {
    const t = new Date(r.date_rdv);
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  });

  const slots: string[] = [];
  for (const p of planning) {
    const startDate = new Date(p.heureDebut);
    const endDate = new Date(p.heureFin);
    const startMin = startDate.getUTCHours() * 60 + startDate.getUTCMinutes();
    const endMin = endDate.getUTCHours() * 60 + endDate.getUTCMinutes();
    const duration = p.dureeCreneau || 30;

    for (let m = startMin; m + duration <= endMin; m += duration) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const slot = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      if (!takenSlots.includes(slot)) slots.push(slot);
    }
  }

  res.json(slots);
}));

export default router;
