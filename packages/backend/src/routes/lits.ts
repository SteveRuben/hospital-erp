import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createPavillonSchema, createLitSchema } from '../middleware/validation.js';
import { Prisma } from '@prisma/client';

const router = Router();

// === PAVILLONS ===
router.get('/pavillons', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT p.*,
             s.nom as service_nom,
             (SELECT COUNT(*) FROM lits l WHERE l.pavillon_id = p.id)::bigint as nb_lits,
             (SELECT COUNT(*) FROM lits l WHERE l.pavillon_id = p.id AND l.statut = 'disponible')::bigint as lits_disponibles
      FROM pavillons p
      LEFT JOIN services s ON p.service_id = s.id
      ORDER BY p.nom
    `;
    res.json(rows.map(r => ({
      ...r,
      nb_lits: Number(r.nb_lits as bigint),
      lits_disponibles: Number(r.lits_disponibles as bigint),
    })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/pavillons', authenticate, authorize('admin'), validate(createPavillonSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, etage, service_id, capacite, description } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.pavillon.create({
      data: {
        nom,
        etage: n(etage) as string | null,
        serviceId: n(service_id) as number | null,
        capacite: capacite || 0,
        description: n(description) as string | null,
      },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === LITS ===
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pavillon_id, statut } = req.query;
    const filters: Prisma.Sql[] = [];
    if (pavillon_id) filters.push(Prisma.sql`l.pavillon_id = ${Number(pavillon_id)}`);
    if (statut) filters.push(Prisma.sql`l.statut = ${String(statut)}`);
    const whereClause = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT l.*, p.nom as pavillon_nom, p.etage
      FROM lits l
      LEFT JOIN pavillons p ON l.pavillon_id = p.id
      ${whereClause}
      ORDER BY p.nom, l.numero
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin'), validate(createLitSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pavillon_id, numero, type_lit } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.lit.create({
      data: {
        pavillonId: pavillon_id ? Number(pavillon_id) : null,
        numero,
        typeLit: (n(type_lit) as string | null) || 'standard',
      },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id/statut', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;
    try {
      const updated = await prisma.lit.update({ where: { id: Number(req.params.id) }, data: { statut } });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Lit non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === HOSPITALISATIONS ===
router.get('/hospitalisations', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut = 'active' } = req.query;
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT h.*,
             p.nom as patient_nom, p.prenom as patient_prenom,
             l.numero as lit_numero,
             pav.nom as pavillon_nom,
             m.nom as medecin_nom, m.prenom as medecin_prenom,
             s.nom as service_nom
      FROM hospitalisations h
      LEFT JOIN patients p ON h.patient_id = p.id
      LEFT JOIN lits l ON h.lit_id = l.id
      LEFT JOIN pavillons pav ON l.pavillon_id = pav.id
      LEFT JOIN medecins m ON h.medecin_id = m.id
      LEFT JOIN services s ON h.service_id = s.id
      WHERE h.statut = ${String(statut)}
      ORDER BY h.date_admission DESC
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/hospitalisations', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, lit_id, medecin_id, service_id, motif, notes } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.$transaction(async (tx) => {
      if (lit_id) {
        await tx.lit.update({ where: { id: Number(lit_id) }, data: { statut: 'occupe' } });
      }
      return tx.hospitalisation.create({
        data: {
          patientId: Number(patient_id),
          litId: n(lit_id) as number | null,
          medecinId: n(medecin_id) as number | null,
          serviceId: n(service_id) as number | null,
          motif: n(motif) as string | null,
          notes: n(notes) as string | null,
        },
      });
    });
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/hospitalisations/:id/sortie', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const hosp = await prisma.hospitalisation.findUnique({ where: { id }, select: { litId: true } });
    if (!hosp) { res.status(404).json({ error: 'Non trouvé' }); return; }
    const updated = await prisma.$transaction(async (tx) => {
      if (hosp.litId) {
        await tx.lit.update({ where: { id: hosp.litId }, data: { statut: 'disponible' } });
      }
      return tx.hospitalisation.update({
        where: { id },
        data: { statut: 'sortie', dateSortie: new Date() },
      });
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Stats
router.get('/stats', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [totalLits, disponibles, occupes, hospActives] = await Promise.all([
      prisma.lit.count(),
      prisma.lit.count({ where: { statut: 'disponible' } }),
      prisma.lit.count({ where: { statut: 'occupe' } }),
      prisma.hospitalisation.count({ where: { statut: 'active' } }),
    ]);
    res.json({ totalLits, disponibles, occupes, hospitalisations: hospActives });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
