import { Router, Request } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { generateFactureHtml, generateOrdonnanceHtml, generateResultatLaboHtml, loadEstablishment } from '../services/print.js';

const router = Router();

// The HTML templates may reference the establishment logo via /uploads/branding/...
// When printed/saved outside the app, a relative URL would 404 — so we prepend
// the request's own origin to the logo path.
const originOf = (req: Request): string => {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host') || '';
  return host ? `${proto}://${host}` : '';
};

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
  const [lignes, paiements, est] = await Promise.all([
    prisma.factureLigne.findMany({ where: { factureId: id } }),
    prisma.paiement.findMany({ where: { factureId: id }, orderBy: { datePaiement: 'asc' } }),
    loadEstablishment(),
  ]);
  const html = generateFactureHtml({ ...facture[0], lignes, paiements }, est, originOf(req));
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
  const [medecin, prescriptions, est] = await Promise.all([
    medecin_id
      ? prisma.user.findFirst({ where: { id: Number(medecin_id), role: 'medecin' }, select: { nom: true, prenom: true } })
      : Promise.resolve(null),
    prisma.prescription.findMany({
      where: { patientId: Number(req.params.patientId), statut: 'active' },
      orderBy: { createdAt: 'desc' },
    }),
    loadEstablishment(),
  ]);
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
  }, est, originOf(req));
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
  const [examens, est] = await Promise.all([
    prisma.examen.findMany({
      where: {
        patientId: Number(req.params.patientId),
        statut: { in: ['valide', 'transmis'] },
      },
      orderBy: { dateExamen: 'desc' },
    }),
    loadEstablishment(),
  ]);
  const html = generateResultatLaboHtml({
    patient_nom: patient.nom, patient_prenom: patient.prenom,
    date: new Date().toISOString(),
    examens: examens.map(e => ({
      type_examen: e.typeExamen,
      resultat: e.resultat ?? undefined,
      date_examen: e.dateExamen instanceof Date ? e.dateExamen.toISOString() : String(e.dateExamen),
    })),
  }, est, originOf(req));
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

// Live preview for the Configuration > Impressions tab. Renders any of the
// three templates with dummy patient data so admins can see how their custom
// entete/pied + coordonnees will look without creating a real document.
router.get('/preview/:type', authenticate, asyncHandler(async (req, res) => {
  const type = req.params.type;
  const est = await loadEstablishment();
  const origin = originOf(req);

  if (type === 'facture') {
    const html = generateFactureHtml({
      numero: 'F-APERCU-001',
      date_facture: new Date().toISOString(),
      patient_nom: 'Dupont',
      patient_prenom: 'Marie',
      patient_telephone: '+225 07 00 00 00 00',
      montant_total: 45000,
      montant_paye: 30000,
      lignes: [
        { libelle: 'Consultation générale', quantite: 1, prix_unitaire: 15000, montant: 15000 },
        { libelle: 'Analyse sanguine NFS', quantite: 1, prix_unitaire: 20000, montant: 20000 },
        { libelle: 'Échographie abdominale', quantite: 1, prix_unitaire: 10000, montant: 10000 },
      ],
      paiements: [{ montant: 30000, mode_paiement: 'Mobile Money', date_paiement: new Date().toISOString() }],
    }, est, origin);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    return;
  }
  if (type === 'ordonnance') {
    const html = generateOrdonnanceHtml({
      patient_nom: 'Dupont', patient_prenom: 'Marie',
      medecin_nom: 'Martin', medecin_prenom: 'Jean',
      date: new Date().toISOString(),
      prescriptions: [
        { medicament: 'Paracétamol 500mg', dosage: '1 comprimé', frequence: '3 fois par jour', duree: '5 jours', voie: 'orale' },
        { medicament: 'Amoxicilline 1g', dosage: '1 comprimé', frequence: '2 fois par jour', duree: '7 jours', voie: 'orale', instructions: 'À prendre au cours des repas' },
      ],
    }, est, origin);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    return;
  }
  if (type === 'labo') {
    const html = generateResultatLaboHtml({
      patient_nom: 'Dupont', patient_prenom: 'Marie',
      date: new Date().toISOString(),
      examens: [
        { type_examen: 'Numération formule sanguine', resultat: 'Hb: 13.2 g/dL — Normal', date_examen: new Date().toISOString() },
        { type_examen: 'Glycémie à jeun', resultat: '0.92 g/L — Normal', date_examen: new Date().toISOString() },
      ],
    }, est, origin);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    return;
  }
  res.status(400).json({ error: 'Type de document inconnu (facture, ordonnance, labo)' });
}));

export default router;
