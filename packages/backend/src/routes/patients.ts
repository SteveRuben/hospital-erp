import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { auditCreate, auditUpdate, auditDelete } from '../services/audit.js';
import { generatePatientReferenceId } from '../services/reference.js';
import { canAccessPatient, accessiblePatientIds } from '../services/access-control.js';
import { validate, createPatientSchema } from '../middleware/validation.js';
import { encryptFields, decryptFields, PATIENT_ENCRYPTED_FIELDS } from '../services/encryption.js';

// OWASP A02: encrypt sensitive PHI at rest. Encryption is a passthrough when
// PHI_ENCRYPTION_KEY is not configured, so this is safe to enable per environment.
// PATIENT_ENCRYPTED_FIELDS lists the camelCase Prisma column names.
const ENC_FIELDS = [...PATIENT_ENCRYPTED_FIELDS];

function decryptPatient<T extends Record<string, unknown> | null>(row: T): T {
  return row ? decryptFields(row as Record<string, unknown>, ENC_FIELDS) as T : row;
}

// Prisma's GroupeSanguin enum names are { Aplus, Amoins, Bplus, Bmoins,
// ABplus, ABmoins, Oplus, Omoins } with @map("A+") etc. The frontend sends
// the human label ("A+") because that's what the <select> displays. Without
// translation Prisma rejects the value with `Invalid value 'A+' for field
// 'groupeSanguin'`, surfacing as a 500 on POST/PUT. Accept both shapes so
// round-tripping (API → form → API) also works.
const GROUPE_LABEL_TO_ENUM: Record<string, string> = {
  'A+': 'Aplus', 'A-': 'Amoins',
  'B+': 'Bplus', 'B-': 'Bmoins',
  'AB+': 'ABplus', 'AB-': 'ABmoins',
  'O+': 'Oplus', 'O-': 'Omoins',
};
function toGroupeSanguin(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null;
  const s = String(v);
  return GROUPE_LABEL_TO_ENUM[s] ?? s; // pass through enum names unchanged
}

const router = Router();

// Get all patients (with optional search)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, archived = 'false', page = '1', limit = '20' } = req.query;
    const where: Prisma.PatientWhereInput = { archived: archived === 'true' };

    if (search) {
      const s = String(search);
      const idNum = Number(s);
      const or: Prisma.PatientWhereInput[] = [
        { nom: { contains: s, mode: 'insensitive' } },
        { prenom: { contains: s, mode: 'insensitive' } },
        { telephone: { contains: s, mode: 'insensitive' } },
      ];
      if (Number.isInteger(idNum) && idNum > 0) or.push({ id: idNum });
      where.OR = or;
    }

    // HIPAA minimum necessary: medecins only see patients they're attributed to.
    const allowedIds = await accessiblePatientIds(req.user!);
    if (allowedIds !== null) where.id = { in: allowedIds };

    const pg = Math.max(1, Number(page));
    const lim = Math.min(100, Math.max(1, Number(limit)));

    const [total, rows] = await Promise.all([
      prisma.patient.count({ where }),
      prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: lim,
        skip: (pg - 1) * lim,
      }),
    ]);

    res.json({ data: rows.map(decryptPatient), total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) });
  } catch (err) {
    console.error('[ERROR] Get patients:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Quick search (for header autocomplete)
router.get('/search/quick', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    if (!q || String(q).length < 2) { res.json([]); return; }
    const s = String(q);
    const idNum = Number(s);
    const or: Prisma.PatientWhereInput[] = [
      { nom: { contains: s, mode: 'insensitive' } },
      { prenom: { contains: s, mode: 'insensitive' } },
      { telephone: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { numeroIdentite: { contains: s, mode: 'insensitive' } },
      { referenceId: { contains: s, mode: 'insensitive' } },
    ];
    if (Number.isInteger(idNum) && idNum > 0) or.push({ id: idNum });
    const where: Prisma.PatientWhereInput = { archived: false, OR: or };
    // HIPAA minimum necessary: medecins only see patients they're attributed to.
    const allowedIds = await accessiblePatientIds(req.user!);
    if (allowedIds !== null) where.id = { in: allowedIds };
    const rows = await prisma.patient.findMany({
      where,
      // referenceId is exposed so the typeahead can show "PAT-2605-MJ-0042"
      // alongside the name. numeroIdentite (encrypted) stays out.
      select: { id: true, nom: true, prenom: true, sexe: true, telephone: true, ville: true, dateNaissance: true, referenceId: true },
      orderBy: { nom: 'asc' },
      take: 10,
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Patient lookup for ordering/registering a service (lab exam, imaging, RDV,
// etc.). Same matchers as /search/quick but bypasses the medecin-attribution
// filter — a laborantin who isn't a "doctor of record" for the patient still
// needs to locate them to register the exam. The PHI exposure is the same
// minimal subset (name, ref, phone, ville); not the full record.
router.get('/search/ordering', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    if (!q || String(q).length < 2) { res.json([]); return; }
    const s = String(q);
    const idNum = Number(s);
    const or: Prisma.PatientWhereInput[] = [
      { nom: { contains: s, mode: 'insensitive' } },
      { prenom: { contains: s, mode: 'insensitive' } },
      { telephone: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { numeroIdentite: { contains: s, mode: 'insensitive' } },
      { referenceId: { contains: s, mode: 'insensitive' } },
    ];
    if (Number.isInteger(idNum) && idNum > 0) or.push({ id: idNum });
    const rows = await prisma.patient.findMany({
      where: { archived: false, OR: or },
      select: { id: true, nom: true, prenom: true, sexe: true, telephone: true, ville: true, dateNaissance: true, referenceId: true },
      orderBy: { nom: 'asc' },
      take: 10,
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Advanced search
router.get('/search/advanced', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, prenom, telephone, ville, sexe, age_min, age_max, medecin_id, reference, contact_urgence, page = '1', limit = '20' } = req.query;

    const where: Prisma.PatientWhereInput = { archived: false };
    const ands: Prisma.PatientWhereInput[] = [];

    if (nom) ands.push({ nom: { contains: String(nom), mode: 'insensitive' } });
    if (prenom) ands.push({ prenom: { contains: String(prenom), mode: 'insensitive' } });
    if (telephone) ands.push({ telephone: { contains: String(telephone), mode: 'insensitive' } });
    if (ville) ands.push({ ville: { contains: String(ville), mode: 'insensitive' } });
    if (sexe) ands.push({ sexe: sexe as Prisma.PatientWhereInput['sexe'] });

    // Age filters need raw SQL via a sub-query for EXTRACT(YEAR FROM AGE(date_naissance))
    // We do those by computing a date cutoff:
    //   age >= age_min  ⇔  date_naissance <= today - age_min years
    //   age <= age_max  ⇔  date_naissance >= today - (age_max + 1) years + 1 day
    if (age_min) {
      const minYears = Number(age_min);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - minYears);
      ands.push({ dateNaissance: { lte: cutoff } });
    }
    if (age_max) {
      const maxYears = Number(age_max);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - maxYears - 1);
      cutoff.setDate(cutoff.getDate() + 1);
      ands.push({ dateNaissance: { gte: cutoff } });
    }

    if (contact_urgence) {
      const s = String(contact_urgence);
      ands.push({
        OR: [
          { contactUrgenceNom: { contains: s, mode: 'insensitive' } },
          { contactUrgenceTelephone: { contains: s, mode: 'insensitive' } },
        ],
      });
    }

    if (reference) {
      const s = String(reference);
      const consults = await prisma.consultation.findMany({
        where: { reference: { contains: s, mode: 'insensitive' } },
        select: { patientId: true },
      });
      const ids = Array.from(new Set(consults.map(c => c.patientId)));
      ands.push({ id: { in: ids.length ? ids : [-1] } });
    }
    if (medecin_id) {
      const consults = await prisma.consultation.findMany({
        where: { medecinId: Number(medecin_id) },
        select: { patientId: true },
      });
      const ids = Array.from(new Set(consults.map(c => c.patientId)));
      ands.push({ id: { in: ids.length ? ids : [-1] } });
    }

    if (ands.length) where.AND = ands;

    // HIPAA minimum necessary: medecins only see patients they're attributed to.
    const allowedIds = await accessiblePatientIds(req.user!);
    if (allowedIds !== null) where.id = { in: allowedIds };

    const pg = Math.max(1, Number(page));
    const lim = Math.min(100, Math.max(1, Number(limit)));

    const [total, rows] = await Promise.all([
      prisma.patient.count({ where }),
      prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: lim,
        skip: (pg - 1) * lim,
      }),
    ]);

    res.json({ data: rows.map(decryptPatient), total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) });
  } catch (err) { console.error('[ERROR] Advanced search:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get single patient (with access control for medecins)
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const patientId = Number(req.params.id);

    if (!(await canAccessPatient(req.user!, patientId))) {
      res.status(403).json({ error: 'Accès refusé — ce patient ne vous est pas attribué' });
      return;
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      res.status(404).json({ error: 'Patient non trouvé' });
      return;
    }
    res.json(decryptPatient(patient));
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create patient
router.post('/', authenticate, authorize('admin', 'medecin', 'reception'), validate(createPatientSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, prenom, deuxieme_prenom, sexe, date_naissance, age_estime, lieu_naissance, nationalite, numero_identite, statut_matrimonial, groupe_sanguin, pays, province, ville, commune, quartier, adresse, profession, telephone, email, contact_urgence_nom, contact_urgence_relation, contact_urgence_telephone } = req.body;

    if (!nom || !prenom) {
      res.status(400).json({ error: 'Nom et prénom requis' });
      return;
    }

    const n = <T,>(v: T): T | null => (v === '' || v === undefined ? null : v) as T | null;
    const reference_id = await generatePatientReferenceId(nom, prenom);

    const data: Prisma.PatientCreateInput = {
      referenceId: reference_id,
      nom,
      prenom,
      deuxiemePrenom: n(deuxieme_prenom),
      sexe: n(sexe) as Prisma.PatientCreateInput['sexe'],
      ageEstime: n(age_estime),
      lieuNaissance: n(lieu_naissance),
      nationalite: n(nationalite),
      numeroIdentite: n(numero_identite),
      statutMatrimonial: n(statut_matrimonial) as Prisma.PatientCreateInput['statutMatrimonial'],
      groupeSanguin: toGroupeSanguin(groupe_sanguin) as Prisma.PatientCreateInput['groupeSanguin'],
      pays: n(pays),
      province: n(province),
      ville: n(ville),
      commune: n(commune),
      quartier: n(quartier),
      adresse: n(adresse),
      profession: n(profession),
      telephone: n(telephone),
      email: n(email),
      contactUrgenceNom: n(contact_urgence_nom),
      contactUrgenceRelation: n(contact_urgence_relation),
      contactUrgenceTelephone: n(contact_urgence_telephone),
    };
    if (date_naissance) data.dateNaissance = new Date(date_naissance);

    // OWASP A02: encrypt PHI fields before persisting
    const created = await prisma.patient.create({ data: encryptFields(data as Record<string, unknown>, ENC_FIELDS) as Prisma.PatientCreateInput });

    auditCreate(req.user!.id, 'patients', created.id, `Created patient ${prenom} ${nom}`);

    res.status(201).json(decryptPatient(created));
  } catch (err) {
    console.error('[ERROR] Create patient:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update patient (with IDOR protection)
router.put('/:id', authenticate, authorize('admin', 'medecin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const patientId = Number(req.params.id);

    if (!(await canAccessPatient(req.user!, patientId))) {
      res.status(403).json({ error: 'Accès refusé — ce patient ne vous est pas attribué' });
      return;
    }

    const { nom, prenom, deuxieme_prenom, sexe, date_naissance, age_estime, lieu_naissance, nationalite, numero_identite, statut_matrimonial, groupe_sanguin, pays, province, ville, commune, quartier, adresse, profession, telephone, email, contact_urgence_nom, contact_urgence_relation, contact_urgence_telephone } = req.body;

    const n = <T,>(v: T): T | null => (v === '' || v === undefined ? null : v) as T | null;

    const before = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!before) { res.status(404).json({ error: 'Patient non trouvé' }); return; }

    const data: Prisma.PatientUpdateInput = {
      nom,
      prenom,
      deuxiemePrenom: n(deuxieme_prenom),
      sexe: n(sexe) as Prisma.PatientUpdateInput['sexe'],
      dateNaissance: date_naissance ? new Date(date_naissance) : null,
      ageEstime: n(age_estime),
      lieuNaissance: n(lieu_naissance),
      nationalite: n(nationalite),
      numeroIdentite: n(numero_identite),
      statutMatrimonial: n(statut_matrimonial) as Prisma.PatientUpdateInput['statutMatrimonial'],
      groupeSanguin: toGroupeSanguin(groupe_sanguin) as Prisma.PatientUpdateInput['groupeSanguin'],
      pays: n(pays),
      province: n(province),
      ville: n(ville),
      commune: n(commune),
      quartier: n(quartier),
      adresse: n(adresse),
      profession: n(profession),
      telephone: n(telephone),
      email: n(email),
      contactUrgenceNom: n(contact_urgence_nom),
      contactUrgenceRelation: n(contact_urgence_relation),
      contactUrgenceTelephone: n(contact_urgence_telephone),
    };

    // OWASP A02: encrypt PHI fields before persisting; audit compares the plaintext form
    const encryptedData = encryptFields(data as Record<string, unknown>, ENC_FIELDS) as Prisma.PatientUpdateInput;
    const updated = await prisma.patient.update({ where: { id: patientId }, data: encryptedData });

    const beforeDecrypted = decryptPatient(before as Record<string, unknown>);
    const updatedDecrypted = decryptPatient(updated);
    auditUpdate(req.user!.id, 'patients', patientId, beforeDecrypted as Record<string, unknown>, updatedDecrypted as Record<string, unknown>);

    res.json(updatedDecrypted);
  } catch (err) {
    console.error('[ERROR] Update patient:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Soft delete patient (with IDOR protection)
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const patientId = Number(req.params.id);

    if (!(await canAccessPatient(req.user!, patientId))) {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }

    try {
      const archived = await prisma.patient.update({
        where: { id: patientId },
        data: { archived: true },
      });
      auditDelete(req.user!.id, 'patients', patientId, `Archived patient ${archived.prenom} ${archived.nom}`);
      res.json({ message: 'Patient archivé' });
    } catch {
      res.status(404).json({ error: 'Patient non trouvé' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get patient history (with IDOR protection + parallel queries + pagination).
// Each collection capped at `limit` (default 100). Front-end can paginate via
// ?limit= and ?page= once it asks for them; today we just cap the response.
router.get('/:id/historique', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const patientId = Number(req.params.id);

    if (!(await canAccessPatient(req.user!, patientId))) {
      res.status(403).json({ error: 'Accès refusé — ce patient ne vous est pas attribué' });
      return;
    }

    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const page = Math.max(1, Number(req.query.page) || 1);
    const skip = (page - 1) * limit;

    // Pull every clinical artifact tied to this patient so the Timeline tab
    // can render a complete chronological history. Each block is independent
    // (Promise.all in parallel) and capped at `limit` rows to keep the
    // response under control for long-running files.
    const [
      consultationsRows, examensRows, recettesRows, documentsRows,
      notesRows, allergiesRows, pathologiesRows,
      prescriptionsRows, ordonnancesRows, vaccinationsRows,
      alertesRows, rendezVousRows, vitauxRows,
      hospitalisationsRows, visitesRows,
    ] = await Promise.all([
      prisma.consultation.findMany({
        where: { patientId },
        select: {
          id: true, reference: true, dateConsultation: true, diagnostic: true, statut: true, motif: true,
          medecin: { select: { nom: true, prenom: true } },
          service: { select: { nom: true } },
        },
        orderBy: { dateConsultation: 'desc' },
        take: limit, skip,
      }),
      prisma.examen.findMany({
        where: { patientId },
        select: { id: true, reference: true, typeExamen: true, resultat: true, dateExamen: true, statut: true },
        orderBy: { dateExamen: 'desc' }, take: limit, skip,
      }),
      prisma.recette.findMany({
        where: { patientId, OR: [{ annulee: false }, { annulee: null }] },
        select: { id: true, typeActe: true, montant: true, modePaiement: true, dateRecette: true },
        orderBy: { dateRecette: 'desc' }, take: limit, skip,
      }),
      prisma.document.findMany({
        where: { patientId },
        select: { id: true, typeDocument: true, description: true, fichierUrl: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
      }),
      prisma.note.findMany({
        where: { patientId },
        select: { id: true, titre: true, contenu: true, typeNote: true, createdAt: true,
          auteur: { select: { nom: true, prenom: true } } },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
      }),
      prisma.allergie.findMany({
        where: { patientId },
        select: { id: true, allergene: true, severite: true, reaction: true, dateDebut: true, createdAt: true, active: true },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
      }),
      prisma.pathologie.findMany({
        where: { patientId },
        select: { id: true, nom: true, codeCim: true, statut: true, dateDebut: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
      }),
      prisma.prescription.findMany({
        where: { patientId },
        select: { id: true, medicament: true, dosage: true, frequence: true, duree: true, dateDebut: true, statut: true, createdAt: true,
          medecin: { select: { nom: true, prenom: true } } },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
      }),
      prisma.ordonnance.findMany({
        where: { patientId },
        select: { id: true, dateOrdonnance: true, statut: true, notes: true, createdAt: true,
          medecin: { select: { nom: true, prenom: true } } },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
      }),
      prisma.vaccination.findMany({
        where: { patientId },
        select: { id: true, vaccin: true, dose: true, dateVaccination: true, dateRappel: true, createdAt: true,
          medecin: { select: { nom: true, prenom: true } } },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
      }),
      prisma.alerte.findMany({
        where: { patientId },
        select: { id: true, typeAlerte: true, message: true, severite: true, active: true, createdAt: true,
          creator: { select: { nom: true, prenom: true } } },
        orderBy: { createdAt: 'desc' }, take: limit, skip,
      }),
      prisma.rendezVous.findMany({
        where: { patientId },
        select: { id: true, dateRdv: true, motif: true, statut: true, createdAt: true,
          medecin: { select: { nom: true, prenom: true } },
          service: { select: { nom: true } } },
        orderBy: { dateRdv: 'desc' }, take: limit, skip,
      }),
      prisma.vital.findMany({
        where: { patientId },
        select: { id: true, temperature: true, tensionSystolique: true, tensionDiastolique: true, pouls: true,
          poids: true, taille: true, glycemie: true, dateMesure: true, createdAt: true },
        orderBy: { dateMesure: 'desc' }, take: limit, skip,
      }),
      prisma.hospitalisation.findMany({
        where: { patientId },
        select: { id: true, dateAdmission: true, dateSortie: true, motif: true, statut: true, createdAt: true,
          medecin: { select: { nom: true, prenom: true } },
          service: { select: { nom: true } } },
        orderBy: { dateAdmission: 'desc' }, take: limit, skip,
      }),
      prisma.visite.findMany({
        where: { patientId },
        select: { id: true, typeVisite: true, dateDebut: true, dateFin: true, statut: true, createdAt: true,
          service: { select: { nom: true } } },
        orderBy: { dateDebut: 'desc' }, take: limit, skip,
      }),
    ]);

    const consultations = consultationsRows.map(c => ({
      id: c.id,
      reference: c.reference,
      date_consultation: c.dateConsultation,
      diagnostic: c.diagnostic,
      statut: c.statut,
      motif: c.motif,
      medecin_nom: c.medecin?.nom ?? null,
      medecin_prenom: c.medecin?.prenom ?? null,
      service_nom: c.service?.nom ?? null,
    }));

    // Flatten the Prisma camelCase to the snake_case the frontend consumes,
    // pulling the joined name fields up to the top level so the Timeline can
    // render "Note de Jean Martin" without re-walking the structure.
    const notes = notesRows.map(n => ({
      id: n.id, titre: n.titre, contenu: n.contenu, type_note: n.typeNote, created_at: n.createdAt,
      auteur_nom: n.auteur?.nom ?? null, auteur_prenom: n.auteur?.prenom ?? null,
    }));
    const allergies = allergiesRows.map(a => ({
      id: a.id, allergene: a.allergene, severite: a.severite, reaction: a.reaction,
      date_debut: a.dateDebut, created_at: a.createdAt, active: a.active,
    }));
    const pathologies = pathologiesRows.map(p => ({
      id: p.id, nom: p.nom, code_cim: p.codeCim, statut: p.statut,
      date_debut: p.dateDebut, created_at: p.createdAt,
    }));
    const prescriptions = prescriptionsRows.map(p => ({
      id: p.id, medicament: p.medicament, dosage: p.dosage, frequence: p.frequence, duree: p.duree,
      date_debut: p.dateDebut, statut: p.statut, created_at: p.createdAt,
      medecin_nom: p.medecin?.nom ?? null, medecin_prenom: p.medecin?.prenom ?? null,
    }));
    const ordonnances = ordonnancesRows.map(o => ({
      id: o.id, date_ordonnance: o.dateOrdonnance, statut: o.statut, notes: o.notes, created_at: o.createdAt,
      medecin_nom: o.medecin?.nom ?? null, medecin_prenom: o.medecin?.prenom ?? null,
    }));
    const vaccinations = vaccinationsRows.map(v => ({
      id: v.id, vaccin: v.vaccin, dose: v.dose, date_vaccination: v.dateVaccination, date_rappel: v.dateRappel,
      created_at: v.createdAt,
      medecin_nom: v.medecin?.nom ?? null, medecin_prenom: v.medecin?.prenom ?? null,
    }));
    const alertes = alertesRows.map(a => ({
      id: a.id, type_alerte: a.typeAlerte, message: a.message, severite: a.severite, active: a.active,
      created_at: a.createdAt,
      created_nom: a.creator?.nom ?? null, created_prenom: a.creator?.prenom ?? null,
    }));
    const rendez_vous = rendezVousRows.map(r => ({
      id: r.id, date_rdv: r.dateRdv, motif: r.motif, statut: r.statut, created_at: r.createdAt,
      medecin_nom: r.medecin?.nom ?? null, medecin_prenom: r.medecin?.prenom ?? null,
      service_nom: r.service?.nom ?? null,
    }));
    const vitaux = vitauxRows.map(v => ({
      id: v.id, temperature: v.temperature, tension_systolique: v.tensionSystolique, tension_diastolique: v.tensionDiastolique,
      pouls: v.pouls, poids: v.poids, taille: v.taille, glycemie: v.glycemie,
      date_mesure: v.dateMesure, created_at: v.createdAt,
    }));
    const hospitalisations = hospitalisationsRows.map(h => ({
      id: h.id, date_admission: h.dateAdmission, date_sortie: h.dateSortie, motif: h.motif, statut: h.statut,
      created_at: h.createdAt,
      medecin_nom: h.medecin?.nom ?? null, medecin_prenom: h.medecin?.prenom ?? null,
      service_nom: h.service?.nom ?? null,
    }));
    const visites = visitesRows.map(v => ({
      id: v.id, type_visite: v.typeVisite, date_debut: v.dateDebut, date_fin: v.dateFin, statut: v.statut,
      created_at: v.createdAt, service_nom: v.service?.nom ?? null,
    }));

    res.json({
      consultations,
      examens: examensRows,
      recettes: recettesRows,
      documents: documentsRows,
      notes, allergies, pathologies,
      prescriptions, ordonnances, vaccinations,
      alertes, rendez_vous, vitaux,
      hospitalisations, visites,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
