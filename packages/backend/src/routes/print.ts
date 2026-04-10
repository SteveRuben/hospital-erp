import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { generateFactureHtml, generateOrdonnanceHtml, generateResultatLaboHtml } from '../services/print.js';

const router = Router();

// Print facture
router.get('/facture/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const facture = await query(`SELECT f.*, p.nom as patient_nom, p.prenom as patient_prenom, p.telephone as patient_telephone FROM factures f LEFT JOIN patients p ON f.patient_id = p.id WHERE f.id = $1`, [req.params.id]);
    if (facture.rows.length === 0) { res.status(404).json({ error: 'Facture non trouvée' }); return; }
    const lignes = await query('SELECT * FROM facture_lignes WHERE facture_id = $1', [req.params.id]);
    const paiements = await query('SELECT * FROM paiements WHERE facture_id = $1 ORDER BY date_paiement', [req.params.id]);
    const html = generateFactureHtml({ ...facture.rows[0], lignes: lignes.rows, paiements: paiements.rows });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Print ordonnance
router.get('/ordonnance/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medecin_id } = req.query;
    const patient = await query('SELECT nom, prenom FROM patients WHERE id = $1', [req.params.patientId]);
    if (patient.rows.length === 0) { res.status(404).json({ error: 'Patient non trouvé' }); return; }
    const medecin = medecin_id ? await query('SELECT nom, prenom FROM medecins WHERE id = $1', [medecin_id]) : { rows: [{ nom: '', prenom: '' }] };
    const prescriptions = await query("SELECT * FROM prescriptions WHERE patient_id = $1 AND statut = 'active' ORDER BY created_at DESC", [req.params.patientId]);
    const html = generateOrdonnanceHtml({
      patient_nom: patient.rows[0].nom, patient_prenom: patient.rows[0].prenom,
      medecin_nom: medecin.rows[0]?.nom || '', medecin_prenom: medecin.rows[0]?.prenom || '',
      date: new Date().toISOString(), prescriptions: prescriptions.rows,
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Print lab results
router.get('/labo/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const patient = await query('SELECT nom, prenom FROM patients WHERE id = $1', [req.params.patientId]);
    if (patient.rows.length === 0) { res.status(404).json({ error: 'Patient non trouvé' }); return; }
    const examens = await query("SELECT * FROM examens WHERE patient_id = $1 AND statut IN ('valide', 'transmis') ORDER BY date_examen DESC", [req.params.patientId]);
    const html = generateResultatLaboHtml({
      patient_nom: patient.rows[0].nom, patient_prenom: patient.rows[0].prenom,
      date: new Date().toISOString(), examens: examens.rows,
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;