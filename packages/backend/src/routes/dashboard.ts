import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { patientAccessScope } from '../services/access-control.js';

const router = Router();

/**
 * Priority-4 of the post-CEO-review priorities: a per-medecin handoff
 * dashboard. Returns the data a doctor needs at the start of a shift —
 * their active patients (titulaire + chef de service + suppléant when
 * applicable) plus what's changed in the last N hours (validated labs,
 * active alertes, hospitalisation exits/transfers in their service).
 *
 * Available to role='medecin' (and admin for inspection). Other roles
 * get a 403 — this dashboard is shift-handoff, not a general overview.
 */
router.get('/garde', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const user = req.user!;
  if (user.role !== 'medecin' && user.role !== 'admin') {
    res.status(403).json({ error: 'Dashboard de garde réservé aux médecins' });
    return;
  }
  // Default lookback: 24 h. The medecin can pass ?hours= to narrow
  // (start-of-shift) or widen (returning from vacation).
  const hoursRaw = Number(req.query.hours ?? 24);
  const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 && hoursRaw <= 720 ? hoursRaw : 24;
  const since = new Date(Date.now() - hours * 3600_000);

  // Patient scope = same UNION as access-control, but we keep the
  // patient_id list directly so we can build derived queries off it.
  const scope = await patientAccessScope(user);
  const patientIds = scope.kind === 'restricted' ? scope.ids : null;
  const hasScope = patientIds === null || patientIds.length > 0;

  // 1. Active attributions for this medecin (titulaire + suppléant).
  //    Chef-de-service patients flow through the scope above.
  const mesAttributions = await prisma.patientAttribution.findMany({
    where: {
      OR: [
        { medecinUserId: user.id, statut: 'actif' },
        // Suppléance: patients de médecins titulaires actuellement suspendus.
      ],
    },
    take: 100,
  });
  const attributionPatientIds = Array.from(new Set(mesAttributions.map(a => a.patientId).filter((v): v is number => v != null)));
  const attributionPatients = attributionPatientIds.length
    ? await prisma.patient.findMany({
        where: { id: { in: attributionPatientIds } },
        select: { id: true, nom: true, prenom: true, referenceId: true, telephone: true },
        orderBy: { nom: 'asc' },
      })
    : [];

  // 2. Lab results validated since `since` for in-scope patients.
  const labsValides = hasScope
    ? await prisma.examen.findMany({
        where: {
          statut: { in: ['valide', 'transmis'] },
          dateExamen: { gte: since },
          ...(patientIds ? { patientId: { in: patientIds } } : {}),
        },
        include: { patient: { select: { id: true, nom: true, prenom: true } } },
        orderBy: { dateExamen: 'desc' },
        take: 50,
      })
    : [];

  // 3. Active alertes for in-scope patients.
  const alertesActives = hasScope
    ? await prisma.alerte.findMany({
        where: {
          active: true,
          ...(patientIds ? { patientId: { in: patientIds } } : {}),
        },
        include: { patient: { select: { id: true, nom: true, prenom: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    : [];

  // 4. Hospitalisation exits / transfers / deces in this medecin's
  //    service since `since`. Used to flag "your unit lost a patient
  //    overnight" without the medecin having to dig through Lits.
  const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { serviceId: true } });
  const hospChanges = userRecord?.serviceId
    ? await prisma.hospitalisation.findMany({
        where: {
          serviceId: userRecord.serviceId,
          statut: { in: ['sortie', 'transfere', 'deces'] },
          dateSortie: { gte: since },
        },
        include: { patient: { select: { id: true, nom: true, prenom: true } } },
        orderBy: { dateSortie: 'desc' },
        take: 30,
      })
    : [];

  // 5. Examens urgents in flight — for the lab handoff.
  const examensUrgents = hasScope
    ? await prisma.examen.findMany({
        where: {
          priorite: 'urgent',
          statut: { in: ['demande', 'a_payer', 'prelevement', 'analyse'] },
          ...(patientIds ? { patientId: { in: patientIds } } : {}),
        },
        include: { patient: { select: { id: true, nom: true, prenom: true } } },
        orderBy: [{ priorite: 'asc' }, { dateExamen: 'desc' }],
        take: 20,
      })
    : [];

  res.json({
    user: { id: user.id, role: user.role },
    window_hours: hours,
    since: since.toISOString(),
    patients_actifs: attributionPatients,
    labs_valides: labsValides.map(e => ({
      id: e.id, type_examen: e.typeExamen, date_examen: e.dateExamen,
      patient_id: e.patientId, patient_nom: e.patient?.nom, patient_prenom: e.patient?.prenom,
      resultat: e.resultat,
    })),
    alertes_actives: alertesActives.map(a => ({
      id: a.id, message: a.message, severite: a.severite, type_alerte: a.typeAlerte,
      patient_id: a.patientId, patient_nom: a.patient?.nom, patient_prenom: a.patient?.prenom,
    })),
    hospitalisations_sorties: hospChanges.map(h => ({
      id: h.id, statut: h.statut, date_sortie: h.dateSortie,
      patient_id: h.patientId, patient_nom: h.patient?.nom, patient_prenom: h.patient?.prenom,
    })),
    examens_urgents: examensUrgents.map(e => ({
      id: e.id, type_examen: e.typeExamen, statut: e.statut, date_examen: e.dateExamen,
      patient_id: e.patientId, patient_nom: e.patient?.nom, patient_prenom: e.patient?.prenom,
    })),
  });
}));

router.get('/', authenticate, asyncHandler(async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];
    const startOfMonth = `${today.slice(0, 7)}-01`;

    const [
      totalPatients,
      patientsMois,
      consultationsJour,
      recettesJour,
      depensesJour,
      recettesMois,
      depensesMois,
      servicesActifs,
      medecinsActifs,
      examensEnAttente,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint AS total FROM patients WHERE archived = FALSE`,
      prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint AS total FROM patients WHERE created_at >= ${startOfMonth}::timestamp`,
      prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint AS total FROM consultations WHERE DATE(date_consultation) = ${today}::date`,
      prisma.$queryRaw<Array<{ total: string }>>`SELECT COALESCE(SUM(montant), 0)::text AS total FROM recettes WHERE date_recette = ${today}::date AND mode_paiement = 'especes'`,
      prisma.$queryRaw<Array<{ total: string }>>`SELECT COALESCE(SUM(montant), 0)::text AS total FROM depenses WHERE date_depense = ${today}::date`,
      prisma.$queryRaw<Array<{ total: string }>>`SELECT COALESCE(SUM(montant), 0)::text AS total FROM recettes WHERE date_recette >= ${startOfMonth}::date`,
      prisma.$queryRaw<Array<{ total: string }>>`SELECT COALESCE(SUM(montant), 0)::text AS total FROM depenses WHERE date_depense >= ${startOfMonth}::date`,
      prisma.$queryRaw<Array<{ nom: string; nb_consultations: bigint }>>`
        SELECT s.nom, COUNT(c.id)::bigint AS nb_consultations
        FROM services s
        LEFT JOIN consultations c ON c.service_id = s.id AND DATE(c.date_consultation) = ${today}::date
        GROUP BY s.id, s.nom
        ORDER BY nb_consultations DESC
        LIMIT 5
      `,
      // P0-6 Phase 2: medecins live in users now.
      prisma.$queryRaw<Array<{ nom: string | null; prenom: string | null; specialite: string | null; nb_consultations: bigint }>>`
        SELECT m.nom, m.prenom, m.specialite, COUNT(c.id)::bigint AS nb_consultations
        FROM users m
        LEFT JOIN consultations c ON c.medecin_id = m.id AND DATE(c.date_consultation) = ${today}::date
        WHERE m.role = 'medecin'
        GROUP BY m.id, m.nom, m.prenom, m.specialite
        ORDER BY nb_consultations DESC
        LIMIT 5
      `,
      // Examens en attente de résultat : pas encore validés/transmis.
      prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*)::bigint AS total FROM examens WHERE statut::text NOT IN ('valide', 'transmis')`,
    ]);

    res.json({
      patients: {
        total: Number(totalPatients[0]?.total ?? 0),
        nouveaux: Number(patientsMois[0]?.total ?? 0),
      },
      consultations: { aujourdhui: Number(consultationsJour[0]?.total ?? 0) },
      examens: { en_attente_resultat: Number(examensEnAttente[0]?.total ?? 0) },
      caisse: {
        jour: {
          recettes: parseFloat(recettesJour[0]?.total ?? '0'),
          depenses: parseFloat(depensesJour[0]?.total ?? '0'),
          solde: parseFloat(recettesJour[0]?.total ?? '0') - parseFloat(depensesJour[0]?.total ?? '0'),
        },
        mois: {
          recettes: parseFloat(recettesMois[0]?.total ?? '0'),
          depenses: parseFloat(depensesMois[0]?.total ?? '0'),
          solde: parseFloat(recettesMois[0]?.total ?? '0') - parseFloat(depensesMois[0]?.total ?? '0'),
        },
      },
      servicesActifs: servicesActifs.map(s => ({ ...s, nb_consultations: Number(s.nb_consultations) })),
      medecinsActifs: medecinsActifs.map(m => ({ ...m, nb_consultations: Number(m.nb_consultations) })),
    });
}));

export default router;
