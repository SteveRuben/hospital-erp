import { Router, Request } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { generateFactureHtml, generateOrdonnanceHtml, generateResultatLaboHtml, generateResumeSortieHtml, generateFicheTransmissionHtml, loadEstablishment } from '../services/print.js';
import { canAccessPatient } from '../services/access-control.js';

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
  if (type === 'resume-sortie') {
    const html = generateResumeSortieHtml({
      patient_nom: 'Dupont', patient_prenom: 'Marie',
      date_admission: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      date_sortie: new Date().toISOString(),
      motif: 'Douleurs abdominales fébriles',
      statut_sortie: 'sortie',
      medecin_nom: 'Martin', medecin_prenom: 'Jean', medecin_specialite: 'Médecine interne',
      service_nom: 'Médecine A',
      diagnostic: 'Appendicite aiguë opérée.',
      traitement_recu: 'Appendicectomie le 26/05, antibiothérapie IV 48h puis relais oral.',
      consignes: 'Repos 2 semaines, pansement à refaire à J+5, alimentation progressive.',
      prescriptions: [
        { medicament: 'Amoxicilline 1g', dosage: '1 cp', frequence: '2x/jour', duree: '5 jours' },
        { medicament: 'Paracétamol 500mg', dosage: '1 cp', frequence: '3x/jour si douleur', duree: '5 jours' },
      ],
      rdv_suivi: 'Contrôle à J+10 — Dr. Martin',
    }, est, origin);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    return;
  }
  if (type === 'fiche-transmission') {
    const html = generateFicheTransmissionHtml({
      patient_id: 42, patient_nom: 'Dupont', patient_prenom: 'Marie',
      age: 38, sexe: 'F',
      date_etablissement: new Date().toISOString(),
      medecin_emetteur_nom: 'Martin', medecin_emetteur_prenom: 'Jean',
      motif_actuel: 'J+2 post-opératoire appendicite, douleur contrôlée, transit non repris.',
      antecedents: 'HTA traitée. Pas d\'allergie connue.',
      constantes: 'TA 125/80 — Pouls 78 — T°37.4 — SpO2 97%',
      traitements_en_cours: 'Amoxicilline 1g 2x/j (J3/5), Paracétamol si douleur.',
      a_surveiller: 'Reprise transit (gaz, selles), signes de péritonite, T°.',
      examens_attente: 'NFS de contrôle prévue demain matin.',
    }, est, origin);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    return;
  }
  res.status(400).json({ error: 'Type de document inconnu (facture, ordonnance, labo, resume-sortie, fiche-transmission)' });
}));

// Real document endpoints — fetch live data and render. The frontend
// opens these in a new tab; printing is the browser's job.

router.get('/resume-sortie/:hospitalisationId', authenticate, asyncHandler(async (req, res) => {
  const hospId = Number(req.params.hospitalisationId);
  const hosp = await prisma.hospitalisation.findUnique({
    where: { id: hospId },
    include: {
      patient: { select: { id: true, nom: true, prenom: true, dateNaissance: true } },
      medecin: { select: { nom: true, prenom: true, specialite: true } },
      service: { select: { nom: true } },
    },
  });
  if (!hosp || !hosp.patient) { res.status(404).json({ error: 'Hospitalisation non trouvée' }); return; }

  // Pull the prescriptions active at discharge (heuristic: created
  // between admission and now). For a richer model we'd flag them as
  // "discharge prescriptions" explicitly — kept simple here.
  const presList = await prisma.prescription.findMany({
    where: {
      patientId: hosp.patient.id,
      createdAt: { gte: hosp.dateAdmission },
      statut: 'active',
    },
    select: { medicament: true, dosage: true, frequence: true, duree: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  // Most recent consultation of this hospitalisation episode gives
  // us the diagnostic + traitement narrative.
  const lastConsult = await prisma.consultation.findFirst({
    where: { patientId: hosp.patient.id, dateConsultation: { gte: hosp.dateAdmission } },
    orderBy: { dateConsultation: 'desc' },
    select: { diagnostic: true, traitement: true, notes: true },
  });

  const est = await loadEstablishment();
  const html = generateResumeSortieHtml({
    patient_nom: hosp.patient.nom, patient_prenom: hosp.patient.prenom,
    date_admission: hosp.dateAdmission.toISOString(),
    date_sortie: (hosp.dateSortie ?? new Date()).toISOString(),
    motif: hosp.motif,
    statut_sortie: hosp.statut,
    medecin_nom: hosp.medecin?.nom ?? '', medecin_prenom: hosp.medecin?.prenom ?? '',
    medecin_specialite: hosp.medecin?.specialite ?? null,
    service_nom: hosp.service?.nom ?? null,
    diagnostic: lastConsult?.diagnostic ?? null,
    traitement_recu: lastConsult?.traitement ?? null,
    consignes: lastConsult?.notes ?? null,
    prescriptions: presList,
    rdv_suivi: null,
  }, est, originOf(req));
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

router.get('/fiche-transmission/:patientId', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const patientId = Number(req.params.patientId);
  if (!(await canAccessPatient(req.user!, patientId))) {
    res.status(403).json({ error: 'Accès refusé' });
    return;
  }
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, nom: true, prenom: true, dateNaissance: true, sexe: true },
  });
  if (!patient) { res.status(404).json({ error: 'Patient non trouvé' }); return; }

  const lastConsult = await prisma.consultation.findFirst({
    where: { patientId },
    orderBy: { dateConsultation: 'desc' },
    select: { diagnostic: true, traitement: true, motif: true },
  });
  const lastVitaux = await prisma.vital.findFirst({
    where: { patientId },
    orderBy: { dateMesure: 'desc' },
    select: { temperature: true, tensionSystolique: true, tensionDiastolique: true, pouls: true, saturationO2: true },
  });
  const allergies = await prisma.allergie.findMany({
    where: { patientId, active: true },
    select: { allergene: true },
    take: 10,
  });
  const pathologies = await prisma.pathologie.findMany({
    where: { patientId, statut: 'active' },
    select: { nom: true },
    take: 10,
  });
  const prescriptions = await prisma.prescription.findMany({
    where: { patientId, statut: 'active' },
    select: { medicament: true, dosage: true, frequence: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const examensEnCours = await prisma.examen.findMany({
    where: { patientId, statut: { in: ['demande', 'a_payer', 'prelevement', 'analyse'] } },
    select: { typeExamen: true, statut: true },
    take: 20,
  });

  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { nom: true, prenom: true } });

  const age = patient.dateNaissance
    ? Math.floor((Date.now() - new Date(patient.dateNaissance).getTime()) / (365.25 * 86_400_000))
    : null;
  const vit = lastVitaux;
  const constantes = vit ? [
    vit.temperature ? `T°${vit.temperature}°C` : null,
    vit.tensionSystolique && vit.tensionDiastolique ? `TA ${vit.tensionSystolique}/${vit.tensionDiastolique}` : null,
    vit.pouls ? `Pouls ${vit.pouls}` : null,
    vit.saturationO2 ? `SpO2 ${vit.saturationO2}%` : null,
  ].filter(Boolean).join(' — ') : '—';

  const antecedents = [
    pathologies.length ? `Pathologies actives: ${pathologies.map(p => p.nom).join(', ')}` : null,
    allergies.length ? `Allergies: ${allergies.map(a => a.allergene).join(', ')}` : 'Pas d\'allergie connue.',
  ].filter(Boolean).join('. ');

  const traitements = prescriptions.length
    ? prescriptions.map(p => `${p.medicament}${p.dosage ? ` ${p.dosage}` : ''}${p.frequence ? ` ${p.frequence}` : ''}`).join('; ')
    : '—';

  const examens = examensEnCours.length
    ? examensEnCours.map(e => `${e.typeExamen} (${e.statut})`).join('; ')
    : 'Aucun examen en attente.';

  const est = await loadEstablishment();
  const html = generateFicheTransmissionHtml({
    patient_id: patient.id,
    patient_nom: patient.nom, patient_prenom: patient.prenom,
    age, sexe: patient.sexe,
    date_etablissement: new Date().toISOString(),
    medecin_emetteur_nom: me?.nom ?? '', medecin_emetteur_prenom: me?.prenom ?? '',
    motif_actuel: lastConsult?.motif ?? lastConsult?.diagnostic ?? null,
    antecedents: antecedents || '—',
    constantes,
    traitements_en_cours: traitements,
    a_surveiller: lastConsult?.traitement ?? '—',
    examens_attente: examens,
  }, est, originOf(req));
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

export default router;
