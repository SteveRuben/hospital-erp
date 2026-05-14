import { Router, Response } from 'express';
import multer from 'multer';
import argon2 from 'argon2';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { Sexe } from '@prisma/client';
import { parseCsv, mapPatientFields, mapMedecinFields, mapTarifFields, mapUserFields } from '../services/import.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

// Import patients
router.post('/patients', authenticate, authorize('admin', 'reception'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Fichier requis' }); return; }
    const content = req.file.buffer.toString('utf-8');
    const rows = parseCsv(content);
    if (rows.length === 0) { res.status(400).json({ error: 'Fichier vide ou format invalide' }); return; }

    let imported = 0, errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const p = mapPatientFields(rows[i]);
        if (!p.nom || !p.prenom) { errors.push(`Ligne ${i + 2}: nom et prénom requis`); continue; }
        const n = (v: string | null | undefined) => v || null;
        await prisma.patient.create({
          data: {
            nom: p.nom,
            prenom: p.prenom,
            sexe: (n(p.sexe) as Sexe | null) ?? undefined,
            dateNaissance: p.date_naissance ? new Date(p.date_naissance) : null,
            telephone: n(p.telephone),
            email: n(p.email),
            adresse: n(p.adresse),
            ville: n(p.ville),
            profession: n(p.profession),
            nationalite: n(p.nationalite),
            contactUrgenceNom: n(p.contact_urgence_nom),
            contactUrgenceTelephone: n(p.contact_urgence_telephone),
          },
        });
        imported++;
      } catch (err) { errors.push(`Ligne ${i + 2}: ${(err as Error).message}`); }
    }
    res.json({ imported, total: rows.length, errors });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Import medecins
router.post('/medecins', authenticate, authorize('admin'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Fichier requis' }); return; }
    const rows = parseCsv(req.file.buffer.toString('utf-8'));
    let imported = 0, errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const m = mapMedecinFields(rows[i]);
        if (!m.nom || !m.prenom) { errors.push(`Ligne ${i + 2}: nom et prénom requis`); continue; }
        await prisma.medecin.create({
          data: { nom: m.nom, prenom: m.prenom, specialite: m.specialite, telephone: m.telephone },
        });
        imported++;
      } catch (err) { errors.push(`Ligne ${i + 2}: ${(err as Error).message}`); }
    }
    res.json({ imported, total: rows.length, errors });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Import tarifs
router.post('/tarifs', authenticate, authorize('admin', 'comptable'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Fichier requis' }); return; }
    const rows = parseCsv(req.file.buffer.toString('utf-8'));
    let imported = 0, errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const t = mapTarifFields(rows[i]);
        if (!t.code || !t.libelle) { errors.push(`Ligne ${i + 2}: code et libellé requis`); continue; }
        const montant = parseFloat(t.montant || '0');
        await prisma.tarif.upsert({
          where: { code: t.code },
          create: { code: t.code, libelle: t.libelle, categorie: t.categorie ?? '', montant },
          update: { libelle: t.libelle, categorie: t.categorie ?? '', montant },
        });
        imported++;
      } catch (err) { errors.push(`Ligne ${i + 2}: ${(err as Error).message}`); }
    }
    res.json({ imported, total: rows.length, errors });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Import users
router.post('/users', authenticate, authorize('admin'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Fichier requis' }); return; }
    const rows = parseCsv(req.file.buffer.toString('utf-8'));
    const defaultPassword = await argon2.hash('Changeme1', { type: argon2.argon2id });
    let imported = 0, errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const u = mapUserFields(rows[i]);
        if (!u.username) { errors.push(`Ligne ${i + 2}: username requis`); continue; }
        const validRoles = ['admin', 'medecin', 'comptable', 'laborantin', 'reception'];
        const role = (validRoles.includes(u.role || '') ? u.role : 'reception') as UserRole;
        // ON CONFLICT DO NOTHING via findFirst + create
        const existing = await prisma.user.findUnique({ where: { username: u.username }, select: { id: true } });
        if (!existing) {
          await prisma.user.create({
            data: {
              username: u.username,
              password: defaultPassword,
              role,
              nom: u.nom,
              prenom: u.prenom,
              telephone: u.telephone,
            },
          });
        }
        imported++;
      } catch (err) { errors.push(`Ligne ${i + 2}: ${(err as Error).message}`); }
    }
    res.json({ imported, total: rows.length, errors, note: 'Mot de passe par défaut: Changeme1' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Download template
router.get('/template/:type', authenticate, (req: AuthRequest, res: Response): void => {
  const templates: Record<string, string> = {
    patients: 'nom,prenom,sexe,date_naissance,telephone,email,adresse,ville,profession,nationalite,contact_urgence_nom,contact_urgence_telephone\nDupont,Jean,M,1990-01-15,+243812345678,jean@email.com,123 Rue Principale,Kinshasa,Ingénieur,RDC,Marie Dupont,+243812345679',
    medecins: 'nom,prenom,specialite,telephone\nMartin,Pierre,Cardiologie,+243812345680\nDurand,Sophie,Pédiatrie,+243812345681',
    tarifs: 'code,libelle,categorie,montant\nCONS-GEN,Consultation générale,Consultation,5000\nLAB-SANG,Analyse de sang,Laboratoire,15000\nIMG-ECHO,Échographie,Imagerie,20000',
    users: 'username,role,nom,prenom,telephone\ndr.martin,medecin,Martin,Jean,+243812345680\ncompta1,comptable,Dubois,Marie,+243812345681\nlabo1,laborantin,Petit,Paul,+243812345682',
  };
  const template = templates[req.params.type];
  if (!template) { res.status(404).json({ error: 'Template non trouvé' }); return; }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=template_${req.params.type}.csv`);
  res.send(template);
});

export default router;
