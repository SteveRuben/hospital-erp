/**
 * Parcours Patient — Kanban de suivi du séjour.
 *
 * Étapes: triage → consultation → examens → traitement → sortie
 *
 * La création d'un patient génère automatiquement un parcours à l'étape
 * 'triage'. Chaque transition est validée par le state machine
 * (workflow.ts). L'admin peut revenir en arrière.
 */

import { Router, Response } from 'express';
import { Prisma, ParcoursStatut } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { assertTransition, WorkflowError } from '../services/workflow.js';
import { logAudit } from '../services/audit.js';
import { patientAccessScope } from '../services/access-control.js';

const router = Router();

const VALID_STATUTS: ReadonlySet<ParcoursStatut> = new Set(
  Object.values(ParcoursStatut) as ParcoursStatut[],
);

// Date field for each step — set when entering that step.
const STEP_DATE_FIELD: Record<ParcoursStatut, string> = {
  triage: 'dateTriage',
  consultation: 'dateConsultation',
  examens: 'dateExamens',
  traitement: 'dateTraitement',
  sortie: 'dateSortie',
};

/**
 * GET /api/parcours — Kanban board data.
 * Returns all active parcours grouped by statut (or filtered).
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut, patient_id, medecin_user_id, priorite, page = '1', limit = '50' } = req.query;
    const where: Prisma.ParcoursPatientWhereInput = {};

    if (statut && VALID_STATUTS.has(statut as ParcoursStatut)) {
      where.statut = statut as ParcoursStatut;
    } else {
      // By default exclude 'sortie' (completed parcours) from the board
      where.statut = { not: ParcoursStatut.sortie };
    }

    if (patient_id) where.patientId = Number(patient_id);
    if (medecin_user_id) where.medecinUserId = Number(medecin_user_id);
    if (priorite) where.priorite = String(priorite);

    // HIPAA: restrict to accessible patients
    const scope = await patientAccessScope(req.user!);
    if (scope.kind === 'restricted') {
      where.patientId = where.patientId
        ? (scope.ids.includes(where.patientId as number) ? where.patientId : -1)
        : { in: scope.ids };
    }

    const pg = Math.max(1, Number(page));
    const lim = Math.min(200, Math.max(1, Number(limit)));

    const [total, rows] = await Promise.all([
      prisma.parcoursPatient.count({ where }),
      prisma.parcoursPatient.findMany({
        where,
        include: {
          patient: { select: { id: true, nom: true, prenom: true, telephone: true, referenceId: true, sexe: true, dateNaissance: true } },
          service: { select: { id: true, nom: true } },
          medecin: { select: { id: true, nom: true, prenom: true, specialite: true } },
        },
        orderBy: [
          { priorite: 'asc' }, // urgent first (alphabetical: n < p < u — reversed in frontend)
          { dateEntree: 'asc' },
        ],
        take: lim,
        skip: (pg - 1) * lim,
      }),
    ]);

    const mapped = rows.map(r => ({
      id: r.id,
      patient_id: r.patientId,
      statut: r.statut,
      service_id: r.serviceId,
      medecin_user_id: r.medecinUserId,
      priorite: r.priorite,
      motif: r.motif,
      notes: r.notes,
      created_by: r.createdBy,
      date_entree: r.dateEntree,
      date_triage: r.dateTriage,
      date_consultation: r.dateConsultation,
      date_examens: r.dateExamens,
      date_traitement: r.dateTraitement,
      date_sortie: r.dateSortie,
      created_at: r.createdAt,
      patient_nom: r.patient?.nom ?? null,
      patient_prenom: r.patient?.prenom ?? null,
      patient_telephone: r.patient?.telephone ?? null,
      patient_reference: r.patient?.referenceId ?? null,
      patient_sexe: r.patient?.sexe ?? null,
      patient_date_naissance: r.patient?.dateNaissance ?? null,
      service_nom: r.service?.nom ?? null,
      medecin_nom: r.medecin?.nom ?? null,
      medecin_prenom: r.medecin?.prenom ?? null,
      medecin_specialite: r.medecin?.specialite ?? null,
    }));

    res.json({ data: mapped, total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) });
  } catch (err) {
    console.error('[PARCOURS] list failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/parcours/stats — count per statut for the Kanban header badges.
 */
router.get('/stats', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await patientAccessScope(req.user!);
    const where: Prisma.ParcoursPatientWhereInput = {};
    if (scope.kind === 'restricted') where.patientId = { in: scope.ids };

    const groups = await prisma.parcoursPatient.groupBy({
      by: ['statut'],
      where,
      _count: { _all: true },
    });

    const stats: Record<string, number> = {};
    for (const s of Object.values(ParcoursStatut)) stats[s] = 0;
    for (const g of groups) stats[g.statut] = g._count._all;

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/parcours — create a new parcours (manual, or called by patient creation).
 */
router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, service_id, medecin_user_id, priorite, motif, notes } = req.body;
    const patientId = Number(patient_id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      res.status(400).json({ error: 'patient_id requis' });
      return;
    }

    // Verify patient exists
    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) { res.status(404).json({ error: 'Patient non trouvé' }); return; }

    const created = await prisma.parcoursPatient.create({
      data: {
        patientId,
        statut: ParcoursStatut.triage,
        serviceId: service_id ? Number(service_id) : null,
        medecinUserId: medecin_user_id ? Number(medecin_user_id) : null,
        priorite: priorite ? String(priorite).substring(0, 20) : 'normal',
        motif: motif ? String(motif).substring(0, 500) : null,
        notes: notes ? String(notes) : null,
        createdBy: req.user!.id,
        dateTriage: new Date(),
      },
    });

    await logAudit({
      userId: req.user!.id, action: 'create', tableName: 'parcours_patient', recordId: created.id,
      details: `Parcours créé pour patient #${patientId} — statut=triage`,
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('[PARCOURS] create failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/parcours/:id/statut — transition the parcours to a new step.
 */
router.patch('/:id/statut', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { statut, notes, medecin_user_id, service_id } = req.body;

    if (!statut || !VALID_STATUTS.has(statut as ParcoursStatut)) {
      res.status(400).json({ error: 'Statut invalide' });
      return;
    }

    const before = await prisma.parcoursPatient.findUnique({ where: { id } });
    if (!before) { res.status(404).json({ error: 'Parcours non trouvé' }); return; }

    // Admin can go backwards; others must follow the state machine
    if (req.user!.role !== 'admin') {
      try { assertTransition('parcours', before.statut, statut); }
      catch (e) {
        if (e instanceof WorkflowError) { res.status(400).json({ error: e.message }); return; }
        throw e;
      }
    }

    const dateField = STEP_DATE_FIELD[statut as ParcoursStatut];
    const data: Prisma.ParcoursPatientUncheckedUpdateInput = {
      statut: statut as ParcoursStatut,
      updatedAt: new Date(),
      [dateField]: new Date(),
    };

    if (notes !== undefined) data.notes = notes;
    if (medecin_user_id !== undefined) data.medecinUserId = medecin_user_id ? Number(medecin_user_id) : null;
    if (service_id !== undefined) data.serviceId = service_id ? Number(service_id) : null;

    const updated = await prisma.parcoursPatient.update({ where: { id }, data });

    await logAudit({
      userId: req.user!.id, action: 'update', tableName: 'parcours_patient', recordId: id,
      details: `Parcours #${id}: ${before.statut} → ${statut}`,
    });

    res.json(updated);
  } catch (err) {
    console.error('[PARCOURS] statut update failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /api/parcours/:id — update metadata (service, medecin, priorite, notes).
 */
router.put('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { service_id, medecin_user_id, priorite, motif, notes } = req.body;

    const before = await prisma.parcoursPatient.findUnique({ where: { id } });
    if (!before) { res.status(404).json({ error: 'Parcours non trouvé' }); return; }

    const data: Prisma.ParcoursPatientUncheckedUpdateInput = { updatedAt: new Date() };
    if (service_id !== undefined) data.serviceId = service_id ? Number(service_id) : null;
    if (medecin_user_id !== undefined) data.medecinUserId = medecin_user_id ? Number(medecin_user_id) : null;
    if (priorite !== undefined) data.priorite = String(priorite).substring(0, 20);
    if (motif !== undefined) data.motif = motif ? String(motif).substring(0, 500) : null;
    if (notes !== undefined) data.notes = notes || null;

    const updated = await prisma.parcoursPatient.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/parcours/:id — admin only, removes a parcours entry.
 */
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await prisma.parcoursPatient.delete({ where: { id } });
    await logAudit({
      userId: req.user!.id, action: 'delete', tableName: 'parcours_patient', recordId: id,
    });
    res.json({ message: 'Parcours supprimé' });
  } catch {
    res.status(404).json({ error: 'Parcours non trouvé' });
  }
});

export default router;
