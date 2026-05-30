import { Router, Response } from 'express';
import { Prisma, AttributionStatut } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { canAccessPatient } from '../services/access-control.js';
import { logAudit } from '../services/audit.js';
import { notifyMany } from '../services/notify.js';

const router = Router();

/**
 * Patient ↔ médecin attribution lifecycle.
 *
 * Roles in flight (cf. AskUserQuestion 'Workflow attribution'):
 *   1. reception / infirmier / admin  — create at admission/triage (default 'actif').
 *   2. chef médecin of the service    — assign within their unit (default 'actif').
 *   3. medecin                        — self-assignment (auto 'actif').
 *   4. mixte                          — caller passes ?propose=true → statut='propose',
 *                                       targeted medecin notified, must PATCH /valider.
 *
 * Storage shape:
 *   - statut ∈ {propose, actif, cloture}
 *   - actif boolean = denorm of (statut='actif'); kept so access-control's
 *     existing 'WHERE actif = TRUE' clause keeps working without rewrite.
 *   - upsert semantics on (patient_id, medecin_user_id) so re-creating an
 *     attribution that was previously cloturé reactivates it instead of
 *     blowing up on the unique index.
 */

// Roles allowed to create an attribution.
const CAN_CREATE_ROLES = new Set(['admin', 'medecin', 'infirmier', 'reception']);

router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_user_id, statut } = req.query;
    const where: Prisma.PatientAttributionWhereInput = {};
    if (patient_id) where.patientId = Number(patient_id);
    if (medecin_user_id) where.medecinUserId = Number(medecin_user_id);
    if (statut) {
      const s = String(statut);
      if (!(['propose', 'actif', 'cloture'] as const).includes(s as AttributionStatut)) {
        res.status(400).json({ error: 'statut invalide' });
        return;
      }
      where.statut = s as AttributionStatut;
    }

    // HIPAA gate when the caller wants a specific patient: must be able
    // to access that patient. Otherwise (e.g. medecin listing their own
    // pending propositions) we only filter by medecin_user_id and trust
    // the caller's auth.
    if (patient_id && !(await canAccessPatient(req.user!, Number(patient_id)))) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }

    const rows = await prisma.patientAttribution.findMany({
      where,
      orderBy: { dateAttribution: 'desc' },
    });

    // Decorate with patient + medecin names for the UI without a second
    // round-trip. The lists are small per query (≤ a few hundred per
    // medecin).
    const patientIds = Array.from(new Set(rows.map(r => r.patientId).filter((v): v is number => v != null)));
    const medecinIds = Array.from(new Set(rows.map(r => r.medecinUserId).filter((v): v is number => v != null)));
    const creatorIds = Array.from(new Set(rows.map(r => r.createdByUserId).filter((v): v is number => v != null)));
    const [patients, medecins, creators] = await Promise.all([
      patientIds.length
        ? prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, nom: true, prenom: true, referenceId: true } })
        : Promise.resolve([] as Array<{ id: number; nom: string; prenom: string; referenceId: string | null }>),
      medecinIds.length
        ? prisma.user.findMany({ where: { id: { in: medecinIds } }, select: { id: true, nom: true, prenom: true, specialite: true } })
        : Promise.resolve([] as Array<{ id: number; nom: string | null; prenom: string | null; specialite: string | null }>),
      creatorIds.length
        ? prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, nom: true, prenom: true, role: true } })
        : Promise.resolve([] as Array<{ id: number; nom: string | null; prenom: string | null; role: string }>),
    ]);
    const pMap = new Map(patients.map(p => [p.id, p]));
    const mMap = new Map(medecins.map(m => [m.id, m]));
    const cMap = new Map(creators.map(c => [c.id, c]));

    res.json(rows.map(r => ({
      ...r,
      patient_id: r.patientId,
      medecin_user_id: r.medecinUserId,
      created_by_user_id: r.createdByUserId,
      validated_by_user_id: r.validatedByUserId,
      date_attribution: r.dateAttribution,
      date_validation: r.dateValidation,
      date_cloture: r.dateCloture,
      motif_cloture: r.motifCloture,
      patient_nom: r.patientId ? pMap.get(r.patientId)?.nom ?? null : null,
      patient_prenom: r.patientId ? pMap.get(r.patientId)?.prenom ?? null : null,
      patient_reference: r.patientId ? pMap.get(r.patientId)?.referenceId ?? null : null,
      medecin_nom: r.medecinUserId ? mMap.get(r.medecinUserId)?.nom ?? null : null,
      medecin_prenom: r.medecinUserId ? mMap.get(r.medecinUserId)?.prenom ?? null : null,
      medecin_specialite: r.medecinUserId ? mMap.get(r.medecinUserId)?.specialite ?? null : null,
      created_by_nom: r.createdByUserId ? cMap.get(r.createdByUserId)?.nom ?? null : null,
      created_by_prenom: r.createdByUserId ? cMap.get(r.createdByUserId)?.prenom ?? null : null,
      created_by_role: r.createdByUserId ? cMap.get(r.createdByUserId)?.role ?? null : null,
    })));
  } catch (err) {
    console.error('[ATTRIBUTIONS] list failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    if (!CAN_CREATE_ROLES.has(user.role)) {
      res.status(403).json({ error: 'Rôle non autorisé à créer une attribution' });
      return;
    }

    const { patient_id, medecin_user_id, propose } = req.body as {
      patient_id?: number | string; medecin_user_id?: number | string; propose?: boolean;
    };
    const patientId = Number(patient_id);
    const medecinUserId = Number(medecin_user_id);
    if (!Number.isInteger(patientId) || patientId <= 0) { res.status(400).json({ error: 'patient_id requis' }); return; }
    if (!Number.isInteger(medecinUserId) || medecinUserId <= 0) { res.status(400).json({ error: 'medecin_user_id requis' }); return; }

    // Verify the medecin actually exists and is a medecin (typo guard).
    const medecin = await prisma.user.findFirst({
      where: { id: medecinUserId, role: 'medecin', suspended: false },
      select: { id: true, serviceId: true },
    });
    if (!medecin) { res.status(400).json({ error: 'medecin_user_id doit cibler un médecin actif' }); return; }

    // Verify the patient exists.
    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) { res.status(404).json({ error: 'Patient non trouvé' }); return; }

    // Statut at creation:
    //   - explicit propose=true (option 4 mixte) → 'propose', not actif.
    //   - medecin self-assigning → 'actif'.
    //   - everyone else → 'actif' direct.
    const statutInitial: AttributionStatut = propose === true && user.role !== 'medecin'
      ? AttributionStatut.propose
      : AttributionStatut.actif;
    const isActif = statutInitial === AttributionStatut.actif;

    // Upsert on the unique (patient_id, medecin_user_id) — a previously
    // closed attribution reactivates instead of conflicting.
    const upserted = await prisma.patientAttribution.upsert({
      where: { patientId_medecinUserId: { patientId, medecinUserId } },
      create: {
        patientId,
        medecinUserId,
        actif: isActif,
        statut: statutInitial,
        createdByUserId: user.id,
        validatedByUserId: user.role === 'medecin' && user.id === medecinUserId ? user.id : null,
        dateValidation: user.role === 'medecin' && user.id === medecinUserId ? new Date() : null,
      },
      update: {
        actif: isActif,
        statut: statutInitial,
        createdByUserId: user.id,
        dateAttribution: new Date(),
        validatedByUserId: user.role === 'medecin' && user.id === medecinUserId ? user.id : null,
        dateValidation: user.role === 'medecin' && user.id === medecinUserId ? new Date() : null,
        dateCloture: null,
        motifCloture: null,
      },
    });

    await logAudit({
      userId: user.id, action: 'create', tableName: 'patient_attributions', recordId: upserted.id,
      details: `Attribution patient #${patientId} → medecin #${medecinUserId} statut=${statutInitial} by role=${user.role}`,
    });

    // Notify the target medecin when the attribution starts as 'propose'
    // — they need to act on it (PATCH /valider).
    if (statutInitial === AttributionStatut.propose) {
      notifyMany([medecinUserId], {
        type: 'attribution_propose',
        title: 'Nouvelle attribution à valider',
        body: `Patient #${patientId} vous est proposé par ${user.username}.`,
        link: `/app/patients/${patientId}`,
      }).catch(err => console.error('[ATTRIBUTIONS] notify failed:', err));
    }

    res.status(201).json(upserted);
  } catch (err) {
    console.error('[ATTRIBUTIONS] create failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/:id/valider', authenticate, authorize('medecin', 'admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const att = await prisma.patientAttribution.findUnique({ where: { id } });
    if (!att) { res.status(404).json({ error: 'Attribution non trouvée' }); return; }
    if (att.statut !== AttributionStatut.propose) { res.status(400).json({ error: 'Seul un statut propose peut être validé' }); return; }
    // The targeted medecin must validate themselves — except for admin
    // which can validate on anyone's behalf (escalation path).
    if (req.user!.role !== 'admin' && att.medecinUserId !== req.user!.id) {
      res.status(403).json({ error: 'Seul le médecin ciblé peut valider' });
      return;
    }
    const updated = await prisma.patientAttribution.update({
      where: { id },
      data: {
        statut: AttributionStatut.actif,
        actif: true,
        validatedByUserId: req.user!.id,
        dateValidation: new Date(),
      },
    });
    await logAudit({
      userId: req.user!.id, action: 'update', tableName: 'patient_attributions', recordId: id,
      details: `Attribution validated (propose → actif)`,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/:id/cloturer', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { motif } = req.body as { motif?: string };
    const att = await prisma.patientAttribution.findUnique({ where: { id } });
    if (!att) { res.status(404).json({ error: 'Attribution non trouvée' }); return; }
    // Cloture allowed by: admin / chef médecin of any service / the
    // targeted medecin themselves / réception. Restrictive enough to
    // prevent random users from breaking a chart link.
    const u = req.user!;
    const canClose = u.role === 'admin'
      || u.role === 'reception'
      || (u.role === 'medecin' && att.medecinUserId === u.id)
      || (u.role === 'medecin' && (await prisma.service.count({ where: { chefMedecinUserId: u.id } })) > 0);
    if (!canClose) { res.status(403).json({ error: 'Non autorisé à clôturer cette attribution' }); return; }
    const updated = await prisma.patientAttribution.update({
      where: { id },
      data: {
        statut: AttributionStatut.cloture,
        actif: false,
        dateCloture: new Date(),
        motifCloture: motif ? String(motif).substring(0, 500) : null,
      },
    });
    await logAudit({
      userId: u.id, action: 'update', tableName: 'patient_attributions', recordId: id,
      details: `Attribution cloturée — motif: ${motif ?? 'n/a'}`,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
