import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Patients par période
router.get('/patients-periode', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ mois: string; total: bigint }>>`
      SELECT TO_CHAR(created_at, 'YYYY-MM') as mois, COUNT(*)::bigint as total
      FROM patients
      WHERE archived = FALSE
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY mois DESC
      LIMIT 12
    `;
    res.json(rows.map(r => ({ mois: r.mois, total: Number(r.total) })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Consultations par médecin
router.get('/consultations-medecin', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    // P0-6 Phase 2: medecins live in users now.
    const rows = await prisma.$queryRaw<Array<{ nom: string | null; prenom: string | null; specialite: string | null; total: bigint }>>`
      SELECT m.nom, m.prenom, m.specialite, COUNT(c.id)::bigint as total
      FROM users m
      LEFT JOIN consultations c ON c.medecin_id = m.id
      WHERE m.role = 'medecin'
      GROUP BY m.id, m.nom, m.prenom, m.specialite
      ORDER BY total DESC
    `;
    res.json(rows.map(r => ({ ...r, total: Number(r.total) })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Recettes par service
router.get('/recettes-service', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ nom: string; total: string | number }>>`
      SELECT s.nom, COALESCE(SUM(r.montant), 0) as total
      FROM services s
      LEFT JOIN recettes r ON r.service_id = s.id
      GROUP BY s.id, s.nom
      ORDER BY total DESC
    `;
    res.json(rows.map(r => ({ nom: r.nom, total: Number(r.total) })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Recettes mensuelles (12 derniers mois)
router.get('/recettes-mensuelles', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ mois: string; total: string | number }>>`
      SELECT TO_CHAR(date_recette, 'YYYY-MM') as mois, SUM(montant) as total
      FROM recettes
      WHERE date_recette >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY TO_CHAR(date_recette, 'YYYY-MM')
      ORDER BY mois
    `;
    res.json(rows.map(r => ({ mois: r.mois, total: Number(r.total) })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Dépenses mensuelles
router.get('/depenses-mensuelles', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ mois: string; total: string | number }>>`
      SELECT TO_CHAR(date_depense, 'YYYY-MM') as mois, SUM(montant) as total
      FROM depenses
      WHERE date_depense >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY TO_CHAR(date_depense, 'YYYY-MM')
      ORDER BY mois
    `;
    res.json(rows.map(r => ({ mois: r.mois, total: Number(r.total) })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Top diagnostics
router.get('/top-diagnostics', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ diagnostic: string; total: bigint }>>`
      SELECT diagnostic, COUNT(*)::bigint as total
      FROM consultations
      WHERE diagnostic IS NOT NULL AND diagnostic != ''
      GROUP BY diagnostic
      ORDER BY total DESC
      LIMIT 10
    `;
    res.json(rows.map(r => ({ diagnostic: r.diagnostic, total: Number(r.total) })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Occupation des lits
router.get('/occupation-lits', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ pavillon: string; total_lits: bigint; occupes: bigint; disponibles: bigint }>>`
      SELECT p.nom as pavillon,
             COUNT(l.id)::bigint as total_lits,
             COUNT(CASE WHEN l.statut = 'occupe' THEN 1 END)::bigint as occupes,
             COUNT(CASE WHEN l.statut = 'disponible' THEN 1 END)::bigint as disponibles
      FROM pavillons p
      LEFT JOIN lits l ON l.pavillon_id = p.id
      GROUP BY p.id, p.nom
    `;
    res.json(rows.map(r => ({
      pavillon: r.pavillon,
      total_lits: Number(r.total_lits),
      occupes: Number(r.occupes),
      disponibles: Number(r.disponibles),
    })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Activité labo
router.get('/activite-labo', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ type_examen: string; total: bigint; revenus: string | number }>>`
      SELECT type_examen, COUNT(*)::bigint as total, COALESCE(SUM(montant), 0) as revenus
      FROM examens
      GROUP BY type_examen
      ORDER BY total DESC
    `;
    res.json(rows.map(r => ({ type_examen: r.type_examen, total: Number(r.total), revenus: Number(r.revenus) })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Examens labo par type et par période. Granularité configurable (jour,
// semaine, mois, année). Sert le tableau de pilotage de l'activité du
// laboratoire demandé par la direction.
//
// Réponse : Array<{ period, type_examen, count, revenus }>
router.get('/labo-par-periode', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const granularity = String(req.query.granularity || 'month');
    if (!['day', 'week', 'month', 'year'].includes(granularity)) {
      res.status(400).json({ error: 'granularity doit être day, week, month ou year' });
      return;
    }
    // Default window depends on granularity — daily makes sense over a month,
    // monthly over a year, yearly over a decade. Calibrated for ~12-30 buckets.
    const defaultIntervalSql: Record<string, string> = {
      day: "30 days",
      week: "12 weeks",
      month: "12 months",
      year: "5 years",
    };
    const dateFormat = granularity === 'year' ? 'YYYY'
      : granularity === 'month' ? 'YYYY-MM'
      : 'YYYY-MM-DD';

    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const typeFilter = req.query.type_examen ? String(req.query.type_examen) : null;

    // Build the WHERE clause via parameterised raw SQL — Prisma's $queryRaw
    // safely interpolates these template parts.
    const rows = typeFilter !== null
      ? await prisma.$queryRaw<Array<{ period: string; type_examen: string; nb: bigint; revenus: number | string }>>`
          SELECT TO_CHAR(DATE_TRUNC(${granularity}, date_examen), ${dateFormat}) AS period,
                 type_examen,
                 COUNT(*)::bigint AS nb,
                 COALESCE(SUM(montant), 0) AS revenus
          FROM examens
          WHERE date_examen >= COALESCE(${from}, CURRENT_DATE - (${defaultIntervalSql[granularity]})::interval)
            AND date_examen <= COALESCE(${to}, CURRENT_DATE)
            AND type_examen = ${typeFilter}
          GROUP BY period, type_examen
          ORDER BY period DESC, nb DESC
        `
      : await prisma.$queryRaw<Array<{ period: string; type_examen: string; nb: bigint; revenus: number | string }>>`
          SELECT TO_CHAR(DATE_TRUNC(${granularity}, date_examen), ${dateFormat}) AS period,
                 type_examen,
                 COUNT(*)::bigint AS nb,
                 COALESCE(SUM(montant), 0) AS revenus
          FROM examens
          WHERE date_examen >= COALESCE(${from}, CURRENT_DATE - (${defaultIntervalSql[granularity]})::interval)
            AND date_examen <= COALESCE(${to}, CURRENT_DATE)
          GROUP BY period, type_examen
          ORDER BY period DESC, nb DESC
        `;

    res.json(rows.map(r => ({
      period: r.period,
      type_examen: r.type_examen,
      count: Number(r.nb),
      revenus: Number(r.revenus),
    })));
  } catch (err) {
    console.error('[REPORTS] labo-par-periode failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Patients distincts vus par service et par période. Granularité configurable
// (semaine, mois, année). Sert le tableau de suivi de l'activité hospitalière
// demandé par la direction : combien de patients distincts par service sur
// l'intervalle ?
//
// Réponse : Array<{ period: 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY', service_id, service_nom, patients: number }>
// `period` est le début du bucket. Les services sans activité dans l'intervalle
// sont omis (= 0 implicite côté UI).
router.get('/patients-by-service-period', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const granularity = String(req.query.granularity || 'month');
    if (!['week', 'month', 'year'].includes(granularity)) {
      res.status(400).json({ error: 'granularity doit être week, month ou year' });
      return;
    }
    // Default window: last 12 buckets of the chosen granularity
    const defaultBuckets = 12;
    const intervalSql: Record<string, string> = {
      week: `${defaultBuckets} weeks`,
      month: `${defaultBuckets} months`,
      year: `${defaultBuckets} years`,
    };
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const serviceFilter = req.query.service_id ? Number(req.query.service_id) : null;

    // date_trunc returns a timestamp; format to ISO date for the bucket
    // boundary so the frontend can use it as a stable key.
    const dateFormat = granularity === 'year' ? 'YYYY' : granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';

    const rows = serviceFilter !== null
      ? await prisma.$queryRaw<Array<{ period: string; service_id: number; service_nom: string; patients: bigint }>>`
          SELECT TO_CHAR(DATE_TRUNC(${granularity}, c.date_consultation), ${dateFormat}) AS period,
                 s.id AS service_id,
                 s.nom AS service_nom,
                 COUNT(DISTINCT c.patient_id)::bigint AS patients
          FROM consultations c
          LEFT JOIN services s ON s.id = c.service_id
          WHERE c.date_consultation >= ${from}
            AND c.date_consultation <= ${to}
            AND s.id = ${serviceFilter}
          GROUP BY period, s.id, s.nom
          ORDER BY period DESC, patients DESC
        `
      : await prisma.$queryRaw<Array<{ period: string; service_id: number; service_nom: string; patients: bigint }>>`
          SELECT TO_CHAR(DATE_TRUNC(${granularity}, c.date_consultation), ${dateFormat}) AS period,
                 s.id AS service_id,
                 s.nom AS service_nom,
                 COUNT(DISTINCT c.patient_id)::bigint AS patients
          FROM consultations c
          LEFT JOIN services s ON s.id = c.service_id
          WHERE c.date_consultation >= ${from}
            AND c.date_consultation <= ${to}
          GROUP BY period, s.id, s.nom
          ORDER BY period DESC, patients DESC
        `;

    res.json(rows.map(r => ({
      period: r.period,
      service_id: r.service_id,
      service_nom: r.service_nom ?? '— Sans service —',
      patients: Number(r.patients),
    })));
  } catch (err) {
    console.error('[REPORTS] patients-by-service-period failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Répartition par mode de paiement
router.get('/modes-paiement', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ mode_paiement: string; nb: bigint; total: string | number }>>`
      SELECT mode_paiement, COUNT(*)::bigint as nb, SUM(montant) as total
      FROM recettes
      WHERE mode_paiement IS NOT NULL
      GROUP BY mode_paiement
    `;
    res.json(rows.map(r => ({ mode_paiement: r.mode_paiement, nb: Number(r.nb), total: Number(r.total) })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
