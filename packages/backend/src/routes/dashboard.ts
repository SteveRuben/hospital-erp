import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

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
      prisma.$queryRaw<Array<{ nom: string; prenom: string; specialite: string | null; nb_consultations: bigint }>>`
        SELECT m.nom, m.prenom, m.specialite, COUNT(c.id)::bigint AS nb_consultations
        FROM medecins m
        LEFT JOIN consultations c ON c.medecin_id = m.id AND DATE(c.date_consultation) = ${today}::date
        GROUP BY m.id, m.nom, m.prenom, m.specialite
        ORDER BY nb_consultations DESC
        LIMIT 5
      `,
    ]);

    res.json({
      patients: {
        total: Number(totalPatients[0]?.total ?? 0),
        nouveaux: Number(patientsMois[0]?.total ?? 0),
      },
      consultations: { aujourdhui: Number(consultationsJour[0]?.total ?? 0) },
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
