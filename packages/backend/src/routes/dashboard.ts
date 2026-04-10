import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = `${today.slice(0, 7)}-01`;
    
    const totalPatients = await query('SELECT COUNT(*) as total FROM patients WHERE archived = FALSE');
    const patientsMois = await query('SELECT COUNT(*) as total FROM patients WHERE created_at >= $1', [startOfMonth]);
    const consultationsJour = await query('SELECT COUNT(*) as total FROM consultations WHERE DATE(date_consultation) = $1', [today]);
    const recettesJour = await query("SELECT COALESCE(SUM(montant), 0) as total FROM recettes WHERE date_recette = $1 AND mode_paiement = 'especes'", [today]);
    const depensesJour = await query('SELECT COALESCE(SUM(montant), 0) as total FROM depenses WHERE date_depense = $1', [today]);
    const recettesMois = await query('SELECT COALESCE(SUM(montant), 0) as total FROM recettes WHERE date_recette >= $1', [startOfMonth]);
    const depensesMois = await query('SELECT COALESCE(SUM(montant), 0) as total FROM depenses WHERE date_depense >= $1', [startOfMonth]);
    const servicesActifs = await query(`SELECT s.nom, COUNT(c.id) as nb_consultations FROM services s LEFT JOIN consultations c ON c.service_id = s.id AND DATE(c.date_consultation) = $1 GROUP BY s.id, s.nom ORDER BY nb_consultations DESC LIMIT 5`, [today]);
    const medecinsActifs = await query(`SELECT m.nom, m.prenom, m.specialite, COUNT(c.id) as nb_consultations FROM medecins m LEFT JOIN consultations c ON c.medecin_id = m.id AND DATE(c.date_consultation) = $1 GROUP BY m.id, m.nom, m.prenom, m.specialite ORDER BY nb_consultations DESC LIMIT 5`, [today]);
    
    res.json({
      patients: { total: parseInt(totalPatients.rows[0].total as string), nouveaux: parseInt(patientsMois.rows[0].total as string) },
      consultations: { aujourdhui: parseInt(consultationsJour.rows[0].total as string) },
      caisse: {
        jour: { recettes: parseFloat(recettesJour.rows[0].total as string), depenses: parseFloat(depensesJour.rows[0].total as string), solde: parseFloat(recettesJour.rows[0].total as string) - parseFloat(depensesJour.rows[0].total as string) },
        mois: { recettes: parseFloat(recettesMois.rows[0].total as string), depenses: parseFloat(depensesMois.rows[0].total as string), solde: parseFloat(recettesMois.rows[0].total as string) - parseFloat(depensesMois.rows[0].total as string) }
      },
      servicesActifs: servicesActifs.rows,
      medecinsActifs: medecinsActifs.rows
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;