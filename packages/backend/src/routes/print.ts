import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { generateFactureHtml, generateOrdonnanceHtml, generateResultatLaboHtml } from '../services/print.js';

const router = Router();

// Print facture
router.get('/facture/:id', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const facture = await prisma.$queryRaw<any[]>`
    SELECT f.*, p.nom AS patient_nom, p.prenom AS patient_prenom, p.telephone AS patient_telephone
    FROM factures f
    LEFT JOIN patients p ON f.patient_id = p.id
    WHERE f.id = ${id}
  `;
  if (facture.length === 0) { res.status(404).json({ error: 'Facture non trouvée' }); return; }
  const lignes = await prisma.factureLigne.findMany({ where: { factureId: id } });
  const paiements = await prisma.paiement.findMany({
    where: { factureId: id },
    orderBy: { datePaiement: 'asc' },
  });
  const html = generateFactureHtml({ ...facture[0], lignes, paiements });
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

// Print ordonnance
router.get('/ordonnance/:patientId', authenticate, asyncHandler(async (req, res) => {
  const { medecin_id } = req.query;
  const patient = await prisma.patient.findUnique({
    where: { id: Number(req.params.patientId) },
    select: { nom: true, prenom: true },
  });
  if (!patient) { res.status(404).json({ error: 'Patient non trouvé' }); return; }
  const medecin = medecin_id
    ? await prisma.medecin.findUnique({
        where: { id: Number(medecin_id) },
        select: { nom: true, prenom: true },
      })
    : null;
  const prescriptions = await prisma.prescription.findMany({
    where: { patientId: Number(req.params.patientId), statut: 'active' },
    orderBy: { createdAt: 'desc' },
  });
  const html = generateOrdonnanceHtml({
    patient_nom: patient.nom, patient_prenom: patient.prenom,
    medecin_nom: medecin?.nom || '', medecin_prenom: medecin?.prenom || '',
    date: new Date().toISOString(),
    prescriptions: prescriptions.map(p => ({
      medicament: p.medicament,
      dosage: p.dosage ?? undefined,
      frequence: p.frequence ?? undefined,
      duree: p.duree ?? undefined,
      voie: p.voie ?? undefined,
      instructions: p.instructions ?? undefined,
    })),
  });
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

// Print lab results
router.get('/labo/:patientId', authenticate, asyncHandler(async (req, res) => {
  const patient = await prisma.patient.findUnique({
    where: { id: Number(req.params.patientId) },
    select: { nom: true, prenom: true },
  });
  if (!patient) { res.status(404).json({ error: 'Patient non trouvé' }); return; }
  const examens = await prisma.examen.findMany({
    where: {
      patientId: Number(req.params.patientId),
      statut: { in: ['valide', 'transmis'] },
    },
    orderBy: { dateExamen: 'desc' },
  });
  const html = generateResultatLaboHtml({
    patient_nom: patient.nom, patient_prenom: patient.prenom,
    date: new Date().toISOString(),
    examens: examens.map(e => ({
      type_examen: e.typeExamen,
      resultat: e.resultat ?? undefined,
      date_examen: e.dateExamen instanceof Date ? e.dateExamen.toISOString() : String(e.dateExamen),
    })),
  });
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

export default router;
