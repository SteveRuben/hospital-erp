import { Router, Response } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
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
        const n = (v: string | null) => v || null;
        await query(`INSERT INTO patients (nom, prenom, sexe, date_naissance, telephone, email, adresse, ville, profession, nationalite, contact_urgence_nom, contact_urgence_telephone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [p.nom, p.prenom, n(p.sexe), n(p.date_naissance), n(p.telephone), n(p.email), n(p.adresse), n(p.ville), n(p.profession), n(p.nationalite), n(p.contact_urgence_nom), n(p.contact_urgence_telephone)]);
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
        await query('INSERT INTO medecins (nom, prenom, specialite, telephone) VALUES ($1,$2,$3,$4)', [m.nom, m.prenom, m.specialite, m.telephone]);
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
        await query('INSERT INTO tarifs (code, libelle, categorie, montant) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO UPDATE SET libelle=$2, categorie=$3, montant=$4',
          [t.code, t.libelle, t.categorie, parseFloat(t.montant || '0')]);
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
    const defaultPassword = await bcrypt.hash('Changeme1', 12);
    let imported = 0, errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const u = mapUserFields(rows[i]);
        if (!u.username) { errors.push(`Ligne ${i + 2}: username requis`); continue; }
        const validRoles = ['admin', 'medecin', 'comptable', 'laborantin', 'reception'];
        const role = validRoles.includes(u.role || '') ? u.role : 'reception';
        await query('INSERT INTO users (username, password, role, nom, prenom, telephone) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (username) DO NOTHING',
          [u.username, defaultPassword, role, u.nom, u.prenom, u.telephone]);
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