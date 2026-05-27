import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { notifyMany } from '../services/notify.js';

const router = Router();

/**
 * When a lab result is newly added, notify whichever medecin is most likely
 * the requester. The schema has `examens.demandeur_id` but the create flow
 * doesn't always populate it; we fall back to the medecin of the patient's
 * most recent consultation. Both signals are best-effort.
 */
async function findResultRecipients(patientId: number, demandeurId: number | null | undefined): Promise<number[]> {
  if (demandeurId) return [demandeurId];
  // Fallback: medecin of the latest consultation, mapped to a user by name match
  const lastConsult = await prisma.consultation.findFirst({
    where: { patientId, medecinId: { not: null } },
    orderBy: { dateConsultation: 'desc' },
    select: { medecin: { select: { nom: true, prenom: true } } },
  });
  if (!lastConsult?.medecin) return [];
  const u = await prisma.user.findFirst({
    where: { role: 'medecin', nom: lastConsult.medecin.nom, prenom: lastConsult.medecin.prenom },
    select: { id: true },
  });
  return u ? [u.id] : [];
}

router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, date_debut, date_fin } = req.query;
    const where: Prisma.ExamenWhereInput = {};
    if (patient_id) where.patientId = Number(patient_id);
    if (date_debut || date_fin) {
      where.dateExamen = {};
      if (date_debut) (where.dateExamen as Prisma.DateTimeFilter).gte = new Date(String(date_debut));
      if (date_fin) (where.dateExamen as Prisma.DateTimeFilter).lte = new Date(String(date_fin));
    }
    const rows = await prisma.examen.findMany({
      where,
      include: { patient: { select: { nom: true, prenom: true, telephone: true } } },
      orderBy: [{ dateExamen: 'desc' }, { id: 'desc' }],
    });
    const mapped = rows.map(e => ({
      ...e,
      patient_nom: e.patient?.nom ?? null,
      patient_prenom: e.patient?.prenom ?? null,
      patient_telephone: e.patient?.telephone ?? null,
    }));
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/stats', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { debut, fin } = req.query;
    const where: Prisma.ExamenWhereInput = {};
    if (debut && fin) {
      where.dateExamen = { gte: new Date(String(debut)), lte: new Date(String(fin)) };
    }

    const totalAgg = await prisma.examen.aggregate({
      where,
      _count: { _all: true },
      _sum: { montant: true },
    });

    const parTypeGroup = await prisma.examen.groupBy({
      by: ['typeExamen'],
      where,
      _count: { _all: true },
      _sum: { montant: true },
    });

    const parType = parTypeGroup.map(g => ({
      type_examen: g.typeExamen,
      nb: g._count._all,
      revenus: g._sum.montant ?? 0,
    }));

    res.json({
      total: totalAgg._count._all,
      revenus: Number(totalAgg._sum.montant ?? 0),
      parType,
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const e = await prisma.examen.findUnique({
      where: { id: Number(req.params.id) },
      include: { patient: { select: { nom: true, prenom: true } } },
    });
    if (!e) { res.status(404).json({ error: 'Examen non trouvé' }); return; }
    res.json({
      ...e,
      patient_nom: e.patient?.nom ?? null,
      patient_prenom: e.patient?.prenom ?? null,
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'laborantin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, type_examen, resultat, date_examen, montant } = req.body;
    const data: Parameters<typeof prisma.examen.create>[0]['data'] = {
      patientId: Number(patient_id),
      typeExamen: type_examen,
      resultat: resultat ?? null,
      montant: montant ?? null,
    };
    if (date_examen) data.dateExamen = new Date(date_examen);
    const created = await prisma.examen.create({ data });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id', authenticate, authorize('admin', 'laborantin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type_examen, resultat, date_examen, montant } = req.body;
    const data: Parameters<typeof prisma.examen.update>[0]['data'] = {
      typeExamen: type_examen,
      resultat,
      montant,
    };
    if (date_examen) data.dateExamen = new Date(date_examen);

    // Need the previous state to detect "result newly added" — null/empty → set.
    const before = await prisma.examen.findUnique({
      where: { id: Number(req.params.id) },
      select: { resultat: true, patientId: true, demandeurId: true, typeExamen: true },
    });
    if (!before) { res.status(404).json({ error: 'Examen non trouvé' }); return; }

    const updated = await prisma.examen.update({ where: { id: Number(req.params.id) }, data });

    const wasEmpty = !before.resultat || before.resultat.trim().length === 0;
    const nowFilled = typeof resultat === 'string' && resultat.trim().length > 0;
    if (wasEmpty && nowFilled) {
      try {
        const recipients = (await findResultRecipients(before.patientId, before.demandeurId)).filter(id => id !== req.user!.id);
        if (recipients.length > 0) {
          const patient = await prisma.patient.findUnique({ where: { id: before.patientId }, select: { nom: true, prenom: true } });
          const label = patient ? `${patient.prenom} ${patient.nom}` : `patient #${before.patientId}`;
          await notifyMany(recipients, {
            type: 'lab_validated',
            title: `Résultat de ${before.typeExamen} disponible`,
            body: `${label} — ${resultat.substring(0, 150)}`,
            link: `/app/patients/${before.patientId}#examens`,
          });
        }
      } catch (err) {
        console.error('[LABORATOIRE] result-ready notification failed:', err);
      }
    }

    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    try {
      await prisma.examen.delete({ where: { id: Number(req.params.id) } });
      res.json({ message: 'Examen supprimé' });
    } catch {
      res.status(404).json({ error: 'Examen non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
