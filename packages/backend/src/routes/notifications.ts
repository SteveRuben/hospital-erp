import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendNotification } from '../services/notification.js';

const router = Router();

// Send notification to patient
router.post('/send', authenticate, asyncHandler(async (req, res) => {
  const { patient_id, subject, message } = req.body;
  if (!patient_id || !message) { res.status(400).json({ error: 'Patient et message requis' }); return; }
  const result = await sendNotification(patient_id, subject || 'Hospital ERP', message);
  res.json(result);
}));

// Send RDV reminder
router.post('/rappel-rdv/:rdvId', authenticate, asyncHandler(async (req, res) => {
  const rdv = await prisma.rendezVous.findUnique({
    where: { id: Number(req.params.rdvId) },
    include: {
      patient: { select: { id: true, nom: true, prenom: true } },
      medecin: { select: { nom: true, prenom: true } },
      service: { select: { nom: true } },
    },
  });
  if (!rdv) { res.status(404).json({ error: 'RDV non trouvé' }); return; }
  const dateStr = new Date(rdv.dateRdv).toLocaleString('fr-FR');
  const message = `Rappel: Vous avez un rendez-vous le ${dateStr} avec Dr. ${rdv.medecin?.prenom ?? ''} ${rdv.medecin?.nom ?? ''} (${rdv.service?.nom || 'Consultation'}).`;
  const result = await sendNotification(rdv.patient.id, 'Rappel de rendez-vous', message);
  res.json(result);
}));

// Send lab results notification
router.post('/resultat-labo/:examenId', authenticate, asyncHandler(async (req, res) => {
  const examen = await prisma.examen.findUnique({
    where: { id: Number(req.params.examenId) },
    include: { patient: { select: { id: true } } },
  });
  if (!examen) { res.status(404).json({ error: 'Examen non trouvé' }); return; }
  const message = `Vos résultats d'analyse (${examen.typeExamen}) sont disponibles. Veuillez vous présenter à l'hôpital pour les récupérer.`;
  const result = await sendNotification(examen.patient.id, 'Résultats disponibles', message);
  res.json(result);
}));

// Get notification log for a patient
router.get('/log/:patientId', authenticate, asyncHandler(async (req, res) => {
  const rows = await prisma.notificationLog.findMany({
    where: { patientId: Number(req.params.patientId) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(rows);
}));

export default router;
