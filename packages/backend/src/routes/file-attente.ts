import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createFileAttenteSchema } from '../middleware/validation.js';
import { Prisma } from '@prisma/client';

const router = Router();

// Get queue for a service (or all) — today only
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { service_id, statut } = req.query;
    const serviceFilter = service_id ? Prisma.sql`AND f.service_id = ${Number(service_id)}` : Prisma.empty;
    const statutFilter = statut ? Prisma.sql`AND f.statut = ${String(statut)}` : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT f.*,
             p.nom as patient_nom, p.prenom as patient_prenom, p.sexe, p.telephone as patient_telephone,
             s.nom as service_nom
      FROM file_attente f
      LEFT JOIN patients p ON f.patient_id = p.id
      LEFT JOIN services s ON f.service_id = s.id
      WHERE DATE(f.date_arrivee) = CURRENT_DATE
      ${serviceFilter}
      ${statutFilter}
      ORDER BY f.priorite ASC, f.numero_ordre ASC
    `;
    res.json(rows);
  } catch (err) { console.error('[ERROR] Get file attente:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Add patient to queue
router.post('/', authenticate, authorize('admin', 'medecin', 'reception'), validate(createFileAttenteSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, service_id, priorite, notes } = req.body;
    if (!patient_id || !service_id) { res.status(400).json({ error: 'Patient et service requis' }); return; }
    // Get next order number for this service today
    const orderResult = await prisma.$queryRaw<Array<{ next_order: number }>>`
      SELECT COALESCE(MAX(numero_ordre), 0) + 1 as next_order
      FROM file_attente
      WHERE service_id = ${Number(service_id)} AND DATE(date_arrivee) = CURRENT_DATE
    `;
    const numero_ordre = Number(orderResult[0].next_order);
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.fileAttente.create({
      data: {
        patientId: Number(patient_id),
        serviceId: Number(service_id),
        priorite: (n(priorite) as string | null) || 'normal',
        numeroOrdre: numero_ordre,
        notes: n(notes) as string | null,
      },
    });
    res.status(201).json(created);
  } catch (err) { console.error('[ERROR] Add to queue:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Update status (en_attente -> en_cours -> termine)
router.put('/:id/statut', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;
    const validStatuts = ['en_attente', 'en_cours', 'termine', 'absent'];
    if (!validStatuts.includes(statut)) { res.status(400).json({ error: 'Statut invalide' }); return; }
    const id = Number(req.params.id);
    const data: { statut: string; datePriseEnCharge?: Date } = { statut };
    if (statut === 'en_cours') data.datePriseEnCharge = new Date();
    try {
      const updated = await prisma.fileAttente.update({ where: { id }, data });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Delete from queue
router.delete('/:id', authenticate, authorize('admin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.fileAttente.delete({ where: { id: Number(req.params.id) } }).catch(() => undefined);
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Stats
router.get('/stats', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [enAttente, enCours, termines, parService] = await Promise.all([
      prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint as total FROM file_attente WHERE statut = 'en_attente' AND DATE(date_arrivee) = CURRENT_DATE`,
      prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint as total FROM file_attente WHERE statut = 'en_cours' AND DATE(date_arrivee) = CURRENT_DATE`,
      prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint as total FROM file_attente WHERE statut = 'termine' AND DATE(date_arrivee) = CURRENT_DATE`,
      prisma.$queryRaw<Array<{ nom: string; en_attente: bigint }>>`
        SELECT s.nom, COUNT(f.id)::bigint as en_attente
        FROM services s
        LEFT JOIN file_attente f ON f.service_id = s.id AND f.statut = 'en_attente' AND DATE(f.date_arrivee) = CURRENT_DATE
        GROUP BY s.id, s.nom
        ORDER BY en_attente DESC
      `,
    ]);
    res.json({
      enAttente: Number(enAttente[0].total),
      enCours: Number(enCours[0].total),
      termines: Number(termines[0].total),
      parService: parService.map(r => ({ nom: r.nom, en_attente: Number(r.en_attente) })),
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
