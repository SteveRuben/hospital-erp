import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

// Admin gère l'agenda de n'importe quel médecin ; un médecin gère le sien.
function canManage(req: AuthRequest, medecinId: number): boolean {
  if (req.user?.role === 'admin') return true;
  return req.user?.role === 'medecin' && req.user.id === medecinId;
}

// GET /:medecinId — agenda complet (récurrent + exceptions à venir).
router.get('/:medecinId', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const medecinId = Number(req.params.medecinId);
  const [disponibilites, exceptions] = await Promise.all([
    prisma.medecinDisponibilite.findMany({ where: { medecinUserId: medecinId }, orderBy: [{ jourSemaine: 'asc' }, { heureDebut: 'asc' }] }),
    prisma.medecinException.findMany({ where: { medecinUserId: medecinId }, orderBy: { date: 'asc' } }),
  ]);
  res.json({
    disponibilites: disponibilites.map(d => ({
      id: d.id, jour_semaine: d.jourSemaine, heure_debut: d.heureDebut, heure_fin: d.heureFin,
    })),
    exceptions: exceptions.map(e => ({
      id: e.id, date: e.date, type: e.type, heure_debut: e.heureDebut, heure_fin: e.heureFin, motif: e.motif,
    })),
  });
}));

// PUT /:medecinId/disponibilites — remplace l'ensemble des créneaux récurrents.
router.put('/:medecinId/disponibilites', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const medecinId = Number(req.params.medecinId);
  if (!canManage(req, medecinId)) { res.status(403).json({ error: 'Accès refusé' }); return; }

  const items = req.body as Array<{ jour_semaine: number; heure_debut: string; heure_fin: string }>;
  if (!Array.isArray(items)) { res.status(400).json({ error: 'Tableau de créneaux requis' }); return; }

  for (const it of items) {
    const j = Number(it.jour_semaine);
    if (!Number.isInteger(j) || j < 0 || j > 6) { res.status(400).json({ error: 'jour_semaine doit être 0..6' }); return; }
    if (!HHMM.test(it.heure_debut) || !HHMM.test(it.heure_fin)) { res.status(400).json({ error: 'Heures au format HH:MM requis' }); return; }
    if (it.heure_debut >= it.heure_fin) { res.status(400).json({ error: `Plage invalide ${it.heure_debut}-${it.heure_fin}` }); return; }
  }

  await prisma.$transaction([
    prisma.medecinDisponibilite.deleteMany({ where: { medecinUserId: medecinId } }),
    prisma.medecinDisponibilite.createMany({
      data: items.map(it => ({
        medecinUserId: medecinId,
        jourSemaine: Number(it.jour_semaine),
        heureDebut: it.heure_debut,
        heureFin: it.heure_fin,
      })),
    }),
  ]);
  res.json({ message: 'Disponibilités enregistrées', count: items.length });
}));

// POST /:medecinId/exceptions — ajoute une exception datée.
router.post('/:medecinId/exceptions', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const medecinId = Number(req.params.medecinId);
  if (!canManage(req, medecinId)) { res.status(403).json({ error: 'Accès refusé' }); return; }

  const { date, type, heure_debut, heure_fin, motif } = req.body as {
    date?: string; type?: string; heure_debut?: string; heure_fin?: string; motif?: string;
  };
  if (!date) { res.status(400).json({ error: 'Date requise' }); return; }
  if (type !== 'absence' && type !== 'presence') { res.status(400).json({ error: "type doit être 'absence' ou 'presence'" }); return; }
  if (heure_debut && !HHMM.test(heure_debut)) { res.status(400).json({ error: 'heure_debut invalide' }); return; }
  if (heure_fin && !HHMM.test(heure_fin)) { res.status(400).json({ error: 'heure_fin invalide' }); return; }
  if (heure_debut && heure_fin && heure_debut >= heure_fin) { res.status(400).json({ error: 'Plage horaire invalide' }); return; }

  const created = await prisma.medecinException.create({
    data: {
      medecinUserId: medecinId,
      date: new Date(`${date}T00:00:00.000Z`),
      type,
      heureDebut: heure_debut || null,
      heureFin: heure_fin || null,
      motif: motif?.substring(0, 255) || null,
    },
  });
  res.status(201).json({
    id: created.id, date: created.date, type: created.type,
    heure_debut: created.heureDebut, heure_fin: created.heureFin, motif: created.motif,
  });
}));

// DELETE /:medecinId/exceptions/:exId
router.delete('/:medecinId/exceptions/:exId', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const medecinId = Number(req.params.medecinId);
  if (!canManage(req, medecinId)) { res.status(403).json({ error: 'Accès refusé' }); return; }
  try {
    await prisma.medecinException.delete({ where: { id: Number(req.params.exId) } });
    res.json({ message: 'Exception supprimée' });
  } catch (err: any) {
    if (err?.code === 'P2025') { res.status(404).json({ error: 'Exception non trouvée' }); return; }
    throw err;
  }
}));

export default router;
