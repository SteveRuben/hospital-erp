import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { generateReference } from '../services/reference.js';
import { validate, createOrderSchema } from '../middleware/validation.js';

const router = Router();

// Get orders for a patient
router.get('/patient/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type_order, statut } = req.query;
    const where: Prisma.OrderWhereInput = { patientId: Number(req.params.patientId) };
    if (type_order) where.typeOrder = String(type_order);
    if (statut) where.statut = String(statut);
    const rows = await prisma.order.findMany({
      where,
      include: {
        concept: { select: { nom: true, code: true } },
        orderer: { select: { nom: true, prenom: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const mapped = rows.map(o => ({
      ...o,
      concept_nom: o.concept?.nom ?? null,
      concept_code: o.concept?.code ?? null,
      orderer_nom: o.orderer?.nom ?? null,
      orderer_prenom: o.orderer?.prenom ?? null,
    }));
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get all active orders (for lab, pharmacy, etc.)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type_order, statut = 'actif', page = '1', limit = '20' } = req.query;
    const where: Prisma.OrderWhereInput = { statut: String(statut) };
    if (type_order) where.typeOrder = String(type_order);

    const pg = Math.max(1, Number(page));
    const lim = Math.min(100, Math.max(1, Number(limit)));

    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          concept: { select: { nom: true, code: true } },
          orderer: { select: { nom: true, prenom: true } },
          patient: { select: { nom: true, prenom: true } },
        },
        orderBy: [{ urgence: 'desc' }, { createdAt: 'desc' }],
        take: lim,
        skip: (pg - 1) * lim,
      }),
    ]);

    const mapped = rows.map(o => ({
      ...o,
      concept_nom: o.concept?.nom ?? null,
      concept_code: o.concept?.code ?? null,
      orderer_nom: o.orderer?.nom ?? null,
      orderer_prenom: o.orderer?.prenom ?? null,
      patient_nom: o.patient?.nom ?? null,
      patient_prenom: o.patient?.prenom ?? null,
    }));

    res.json({ data: mapped, total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create order
router.post('/', authenticate, authorize('admin', 'medecin'), validate(createOrderSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, encounter_id, concept_id, type_order, urgence, instructions, dosage, frequence, duree, voie, quantite } = req.body;
    if (!patient_id || !type_order) { res.status(400).json({ error: 'Patient et type requis' }); return; }
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const reference = await generateReference('orders');
    const created = await prisma.order.create({
      data: {
        reference,
        patientId: Number(patient_id),
        encounterId: n(encounter_id) as number | null,
        conceptId: n(concept_id) as number | null,
        typeOrder: String(type_order),
        ordererId: req.user!.id,
        urgence: (n(urgence) as string | null) || 'routine',
        instructions: n(instructions) as string | null,
        dosage: n(dosage) as string | null,
        frequence: n(frequence) as string | null,
        duree: n(duree) as string | null,
        voie: n(voie) as string | null,
        quantite: n(quantite) as number | null,
      },
    });
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Update order status
router.put('/:id/statut', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut, resultat } = req.body;
    const validStatuts = ['nouveau', 'actif', 'complete', 'annule', 'expire'];
    if (!validStatuts.includes(statut)) { res.status(400).json({ error: 'Statut invalide' }); return; }
    const data: Parameters<typeof prisma.order.update>[0]['data'] = { statut };
    if (resultat) {
      data.resultat = resultat;
      data.dateResultat = new Date();
    }
    try {
      const updated = await prisma.order.update({ where: { id: Number(req.params.id) }, data });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
