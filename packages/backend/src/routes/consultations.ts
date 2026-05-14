import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { getPaginationParams, paginatedResponse } from '../middleware/pagination.js';
import { validate, createConsultationSchema } from '../middleware/validation.js';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, service_id, date_debut, date_fin } = req.query;
    const { page, limit, offset } = getPaginationParams(req);

    const where: Prisma.ConsultationWhereInput = {};
    if (patient_id) where.patientId = Number(patient_id);
    if (medecin_id) where.medecinId = Number(medecin_id);
    if (service_id) where.serviceId = Number(service_id);
    if (date_debut || date_fin) {
      where.dateConsultation = {};
      if (date_debut) (where.dateConsultation as Prisma.DateTimeFilter).gte = new Date(String(date_debut));
      if (date_fin) (where.dateConsultation as Prisma.DateTimeFilter).lte = new Date(String(date_fin));
    }

    const [total, rows] = await Promise.all([
      prisma.consultation.count({ where }),
      prisma.consultation.findMany({
        where,
        include: {
          patient: { select: { nom: true, prenom: true } },
          medecin: { select: { nom: true, prenom: true, specialite: true } },
          service: { select: { nom: true } },
        },
        orderBy: { dateConsultation: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    const mapped = rows.map(c => ({
      ...c,
      patient_nom: c.patient?.nom ?? null,
      patient_prenom: c.patient?.prenom ?? null,
      medecin_nom: c.medecin?.nom ?? null,
      medecin_prenom: c.medecin?.prenom ?? null,
      specialite: c.medecin?.specialite ?? null,
      service_nom: c.service?.nom ?? null,
    }));

    res.json(paginatedResponse(mapped, total, { page, limit, offset }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const c = await prisma.consultation.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        patient: { select: { nom: true, prenom: true } },
        medecin: { select: { nom: true, prenom: true } },
        service: { select: { nom: true } },
      },
    });
    if (!c) { res.status(404).json({ error: 'Consultation non trouvée' }); return; }
    res.json({
      ...c,
      patient_nom: c.patient?.nom ?? null,
      patient_prenom: c.patient?.prenom ?? null,
      medecin_nom: c.medecin?.nom ?? null,
      medecin_prenom: c.medecin?.prenom ?? null,
      service_nom: c.service?.nom ?? null,
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createConsultationSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, service_id, diagnostic, traitement, notes } = req.body;
    const created = await prisma.consultation.create({
      data: {
        patientId: Number(patient_id),
        medecinId: medecin_id ?? null,
        serviceId: service_id ?? null,
        diagnostic: diagnostic ?? null,
        traitement: traitement ?? null,
        notes: notes ?? null,
      },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { diagnostic, traitement, notes } = req.body;
    try {
      const updated = await prisma.consultation.update({
        where: { id: Number(req.params.id) },
        data: { diagnostic, traitement, notes },
      });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Consultation non trouvée' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    try {
      await prisma.consultation.delete({ where: { id: Number(req.params.id) } });
      res.json({ message: 'Consultation supprimée' });
    } catch {
      res.status(404).json({ error: 'Consultation non trouvée' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
