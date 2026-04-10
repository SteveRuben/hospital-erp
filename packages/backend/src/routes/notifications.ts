import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { sendNotification } from '../services/notification.js';

const router = Router();

// Send notification to patient
router.post('/send', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, subject, message } = req.body;
    if (!patient_id || !message) { res.status(400).json({ error: 'Patient et message requis' }); return; }
    const result = await sendNotification(patient_id, subject || 'Hospital ERP', message);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Send RDV reminder
router.post('/rappel-rdv/:rdvId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rdv = await query(`SELECT r.*, p.id as pid, p.nom as patient_nom, p.prenom as patient_prenom, m.nom as medecin_nom, m.prenom as medecin_prenom, s.nom as service_nom FROM rendez_vous r LEFT JOIN patients p ON r.patient_id = p.id LEFT JOIN medecins m ON r.medecin_id = m.id LEFT JOIN services s ON r.service_id = s.id WHERE r.id = $1`, [req.params.rdvId]);
    if (rdv.rows.length === 0) { res.status(404).json({ error: 'RDV non trouvé' }); return; }
    const r = rdv.rows[0];
    const dateStr = new Date(r.date_rdv).toLocaleString('fr-FR');
    const message = `Rappel: Vous avez un rendez-vous le ${dateStr} avec Dr. ${r.medecin_prenom} ${r.medecin_nom} (${r.service_nom || 'Consultation'}).`;
    const result = await sendNotification(r.pid, 'Rappel de rendez-vous', message);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Send lab results notification
router.post('/resultat-labo/:examenId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const examen = await query('SELECT e.*, p.id as pid FROM examens e LEFT JOIN patients p ON e.patient_id = p.id WHERE e.id = $1', [req.params.examenId]);
    if (examen.rows.length === 0) { res.status(404).json({ error: 'Examen non trouvé' }); return; }
    const e = examen.rows[0];
    const message = `Vos résultats d'analyse (${e.type_examen}) sont disponibles. Veuillez vous présenter à l'hôpital pour les récupérer.`;
    const result = await sendNotification(e.pid, 'Résultats disponibles', message);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get notification log for a patient
router.get('/log/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM notifications_log WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.patientId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;