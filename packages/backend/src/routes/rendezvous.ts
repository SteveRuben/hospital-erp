import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createRendezVousSchema } from '../middleware/validation.js';
import { Prisma } from '@prisma/client';

const router = Router();

const baseSelect = Prisma.sql`
  SELECT r.*,
         p.nom as patient_nom, p.prenom as patient_prenom,
         m.nom as medecin_nom, m.prenom as medecin_prenom,
         s.nom as service_nom
  FROM rendez_vous r
  LEFT JOIN patients p ON r.patient_id = p.id
  LEFT JOIN medecins m ON r.medecin_id = m.id
  LEFT JOIN services s ON r.service_id = s.id
`;

// Get all rendez-vous (with optional filters)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date, medecin_id, service_id, statut } = req.query;
    const filters: Prisma.Sql[] = [];
    if (date) filters.push(Prisma.sql`DATE(r.date_rdv) = ${String(date)}::date`);
    if (medecin_id) filters.push(Prisma.sql`r.medecin_id = ${Number(medecin_id)}`);
    if (service_id) filters.push(Prisma.sql`r.service_id = ${Number(service_id)}`);
    if (statut) filters.push(Prisma.sql`r.statut = ${String(statut)}`);
    const whereClause = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      ${baseSelect}
      ${whereClause}
      ORDER BY r.date_rdv ASC
    `;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get today's rendez-vous
router.get('/today', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      ${baseSelect}
      WHERE DATE(r.date_rdv) = CURRENT_DATE
      ORDER BY r.date_rdv ASC
    `;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get single rendez-vous
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      ${baseSelect}
      WHERE r.id = ${id}
    `;
    if (rows.length === 0) {
      res.status(404).json({ error: 'Rendez-vous non trouvé' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create rendez-vous
router.post('/', authenticate, authorize('admin', 'medecin', 'reception'), validate(createRendezVousSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, service_id, date_rdv, motif, notes } = req.body;

    if (!patient_id || !medecin_id || !date_rdv) {
      res.status(400).json({ error: 'Patient, médecin et date requis' });
      return;
    }

    const created = await prisma.rendezVous.create({
      data: {
        patientId: Number(patient_id),
        medecinId: Number(medecin_id),
        serviceId: service_id ? Number(service_id) : null,
        dateRdv: new Date(date_rdv),
        motif: motif ?? null,
        notes: notes ?? null,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update rendez-vous
router.put('/:id', authenticate, authorize('admin', 'medecin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { patient_id, medecin_id, service_id, date_rdv, motif, notes, statut } = req.body;

    const data: Prisma.RendezVousUpdateInput = {
      patient: { connect: { id: Number(patient_id) } },
      medecin: medecin_id ? { connect: { id: Number(medecin_id) } } : { disconnect: true },
      service: service_id ? { connect: { id: Number(service_id) } } : { disconnect: true },
      dateRdv: new Date(date_rdv),
      motif: motif ?? null,
      notes: notes ?? null,
    };
    if (statut !== undefined && statut !== null) data.statut = statut;

    try {
      const updated = await prisma.rendezVous.update({ where: { id }, data });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Rendez-vous non trouvé' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update statut only
router.put('/:id/statut', authenticate, authorize('admin', 'medecin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;

    if (!statut) {
      res.status(400).json({ error: 'Statut requis' });
      return;
    }

    const validStatuts = ['planifie', 'confirme', 'en_cours', 'termine', 'annule', 'absent'];
    if (!validStatuts.includes(statut)) {
      res.status(400).json({ error: 'Statut invalide' });
      return;
    }

    try {
      const updated = await prisma.rendezVous.update({ where: { id: Number(req.params.id) }, data: { statut } });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Rendez-vous non trouvé' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete rendez-vous
router.delete('/:id', authenticate, authorize('admin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    try {
      await prisma.rendezVous.delete({ where: { id: Number(req.params.id) } });
      res.json({ message: 'Rendez-vous supprimé' });
    } catch {
      res.status(404).json({ error: 'Rendez-vous non trouvé' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
