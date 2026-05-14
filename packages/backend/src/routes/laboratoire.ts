import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

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
    try {
      const updated = await prisma.examen.update({ where: { id: Number(req.params.id) }, data });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Examen non trouvé' });
    }
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
