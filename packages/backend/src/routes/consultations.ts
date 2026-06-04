import { Router, Response } from 'express';
import { Prisma, ConsultationStatut, ExamenStatut } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { getPaginationParams, paginatedResponse } from '../middleware/pagination.js';
import { validate, createConsultationSchema } from '../middleware/validation.js';
import { patientAccessScope, canAccessPatient } from '../services/access-control.js';
import { assertTransition, WorkflowError } from '../services/workflow.js';
import { logAudit } from '../services/audit.js';
import { billConsultation } from '../services/billing.js';

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
    // HIPAA minimum-necessary: a medecin can only see consultations for
    // patients they're attributed to. Intersect with any caller-supplied
    // patient_id filter so a medecin asking about an unattributed patient
    // gets an empty list instead of nothing-blocked.
    const scope = await patientAccessScope(req.user!);
    if (scope.kind === 'restricted') {
      where.patientId = where.patientId
        ? (scope.ids.includes(where.patientId as number) ? where.patientId : -1)
        : { in: scope.ids };
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

    // Statut « en attente des résultats » dérivé : nombre d'examens liés à
    // chaque consultation qui ne sont pas encore validés/transmis. Une seule
    // requête groupée pour la page (pas de N+1).
    const consultIds = rows.map(r => r.id);
    const pendingGroups = consultIds.length
      ? await prisma.examen.groupBy({
          by: ['consultationId'],
          where: { consultationId: { in: consultIds }, statut: { notIn: [ExamenStatut.valide, ExamenStatut.transmis] } },
          _count: { _all: true },
        })
      : [];
    const pendingByConsult = new Map(pendingGroups.map(g => [g.consultationId, g._count._all]));

    const mapped = rows.map(c => ({
      ...c,
      patient_id: c.patientId,
      medecin_id: c.medecinId,
      service_id: c.serviceId,
      date_consultation: c.dateConsultation,
      patient_nom: c.patient?.nom ?? null,
      patient_prenom: c.patient?.prenom ?? null,
      medecin_nom: c.medecin?.nom ?? null,
      medecin_prenom: c.medecin?.prenom ?? null,
      specialite: c.medecin?.specialite ?? null,
      service_nom: c.service?.nom ?? null,
      examens_en_attente: pendingByConsult.get(c.id) ?? 0,
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
    if (!(await canAccessPatient(req.user!, c.patientId))) {
      res.status(403).json({ error: 'Accès refusé — ce patient ne vous est pas attribué' });
      return;
    }
    res.json({
      ...c,
      patient_id: c.patientId,
      medecin_id: c.medecinId,
      service_id: c.serviceId,
      date_consultation: c.dateConsultation,
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

/**
 * PATCH /:id/statut — transition the consultation state (en_cours → terminee/annulee).
 * Closes the gap where consultations stayed en_cours forever.
 */
router.patch('/:id/statut', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { statut } = req.body;

    if (!statut || !['en_cours', 'terminee', 'annulee'].includes(statut)) {
      res.status(400).json({ error: 'Statut invalide (en_cours, terminee, annulee)' });
      return;
    }

    const before = await prisma.consultation.findUnique({ where: { id }, select: { statut: true, patientId: true } });
    if (!before) { res.status(404).json({ error: 'Consultation non trouvée' }); return; }

    // Admin bypass for backwards transitions
    if (req.user!.role !== 'admin') {
      try { assertTransition('consultation', before.statut ?? 'en_cours', statut); }
      catch (e) {
        if (e instanceof WorkflowError) { res.status(400).json({ error: e.message }); return; }
        throw e;
      }
    }

    const updated = await prisma.consultation.update({
      where: { id },
      data: { statut: statut as ConsultationStatut },
    });

    await logAudit({
      userId: req.user!.id, action: 'update', tableName: 'consultations', recordId: id,
      details: `Consultation #${id}: ${before.statut} → ${statut}`,
    });

    // Auto-billing (flow analysis §5): a completed consultation generates a
    // revenue line from the linked service price. Best-effort and idempotent —
    // never blocks the status change.
    if (statut === 'terminee') {
      billConsultation(id, req.user!.id).catch(() => { /* logged inside */ });
    }

    res.json(updated);
  } catch (err) {
    console.error('[CONSULTATIONS] statut update failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
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
