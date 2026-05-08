import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { auditCreate, auditUpdate, auditDelete } from '../services/audit.js';

const router = Router();

/**
 * Check if a medecin user has access to a specific patient.
 * Admin, comptable, reception, laborantin have access to all patients.
 * Medecin only has access to patients they've consulted or been attributed.
 */
async function canAccessPatient(user: { id: number; role: string }, patientId: number): Promise<boolean> {
  if (user.role !== 'medecin') return true; // Non-medecin roles have full access
  // Check if medecin has a consultation or attribution with this patient
  const result = await query(
    `SELECT 1 FROM (
      SELECT patient_id FROM consultations WHERE medecin_id IN (SELECT id FROM medecins WHERE nom = (SELECT nom FROM users WHERE id = $1) AND prenom = (SELECT prenom FROM users WHERE id = $1))
      UNION
      SELECT patient_id FROM patient_attributions WHERE medecin_user_id = $1 AND actif = TRUE
    ) sub WHERE patient_id = $2 LIMIT 1`,
    [user.id, patientId]
  );
  return result.rows.length > 0;
}

// Get all patients (with optional search)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, archived = 'false', page = '1', limit = '20' } = req.query;
    let sql = 'SELECT * FROM patients WHERE archived = $1';
    const params: unknown[] = [archived === 'true'];
    
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (nom ILIKE $2 OR prenom ILIKE $2 OR telephone ILIKE $2 OR CAST(id AS TEXT) ILIKE $2)`;
    }

    // Count
    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const total = parseInt(countResult.rows[0].total as string);

    const pg = Math.max(1, Number(page));
    const lim = Math.min(100, Math.max(1, Number(limit)));
    params.push(lim); sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    params.push((pg - 1) * lim); sql += ` OFFSET $${params.length}`;
    
    const result = await query(sql, params);
    res.json({ data: result.rows, total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) });
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
    const term = `%${q}%`;
    const result = await query(
      `SELECT id, nom, prenom, sexe, telephone, ville, date_naissance FROM patients WHERE archived = FALSE AND (nom ILIKE $1 OR prenom ILIKE $1 OR telephone ILIKE $1 OR email ILIKE $1 OR numero_identite ILIKE $1 OR CAST(id AS TEXT) = $2) ORDER BY nom LIMIT 10`,
      [term, String(q)]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Advanced search
router.get('/search/advanced', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, prenom, telephone, ville, sexe, age_min, age_max, medecin_id, reference, contact_urgence, page = '1', limit = '20' } = req.query;
    let sql = 'SELECT p.* FROM patients p WHERE p.archived = FALSE';
    const params: unknown[] = [];

    if (nom) { params.push(`%${nom}%`); sql += ` AND p.nom ILIKE $${params.length}`; }
    if (prenom) { params.push(`%${prenom}%`); sql += ` AND p.prenom ILIKE $${params.length}`; }
    if (telephone) { params.push(`%${telephone}%`); sql += ` AND p.telephone ILIKE $${params.length}`; }
    if (ville) { params.push(`%${ville}%`); sql += ` AND p.ville ILIKE $${params.length}`; }
    if (sexe) { params.push(sexe); sql += ` AND p.sexe = $${params.length}`; }
    if (age_min) { params.push(Number(age_min)); sql += ` AND EXTRACT(YEAR FROM AGE(COALESCE(p.date_naissance, CURRENT_DATE))) >= $${params.length}`; }
    if (age_max) { params.push(Number(age_max)); sql += ` AND EXTRACT(YEAR FROM AGE(COALESCE(p.date_naissance, CURRENT_DATE))) <= $${params.length}`; }
    if (contact_urgence) { params.push(`%${contact_urgence}%`); sql += ` AND (p.contact_urgence_nom ILIKE $${params.length} OR p.contact_urgence_telephone ILIKE $${params.length})`; }
    if (reference) { params.push(`%${reference}%`); sql += ` AND p.id IN (SELECT patient_id FROM consultations WHERE reference ILIKE $${params.length})`; }
    if (medecin_id) { params.push(Number(medecin_id)); sql += ` AND p.id IN (SELECT patient_id FROM consultations WHERE medecin_id = $${params.length})`; }

    // Count total
    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const total = parseInt(countResult.rows[0].total as string);

    // Paginate
    const pg = Math.max(1, Number(page));
    const lim = Math.min(100, Math.max(1, Number(limit)));
    params.push(lim); sql += ` ORDER BY p.created_at DESC LIMIT $${params.length}`;
    params.push((pg - 1) * lim); sql += ` OFFSET $${params.length}`;

    const result = await query(sql, params);
    res.json({ data: result.rows, total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) });
  } catch (err) { console.error('[ERROR] Advanced search:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get single patient (with access control for medecins)
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const patientId = Number(req.params.id);
    
    // Access control: medecins can only see their own patients
    if (!(await canAccessPatient(req.user!, patientId))) {
      res.status(403).json({ error: 'Accès refusé — ce patient ne vous est pas attribué' });
      return;
    }

    const result = await query('SELECT * FROM patients WHERE id = $1', [patientId]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Patient non trouvé' });
      return;
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create patient
router.post('/', authenticate, authorize('admin', 'medecin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, prenom, deuxieme_prenom, sexe, date_naissance, age_estime, lieu_naissance, nationalite, numero_identite, statut_matrimonial, groupe_sanguin, pays, province, ville, commune, quartier, adresse, profession, telephone, email, contact_urgence_nom, contact_urgence_relation, contact_urgence_telephone } = req.body;
    
    if (!nom || !prenom) {
      res.status(400).json({ error: 'Nom et prénom requis' });
      return;
    }

    // Convert empty strings to null for CHECK constraints
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;

    const result = await query(
      `INSERT INTO patients (nom, prenom, deuxieme_prenom, sexe, date_naissance, age_estime, lieu_naissance, nationalite, numero_identite, statut_matrimonial, groupe_sanguin, pays, province, ville, commune, quartier, adresse, profession, telephone, email, contact_urgence_nom, contact_urgence_relation, contact_urgence_telephone) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) 
       RETURNING *`,
      [nom, prenom, n(deuxieme_prenom), n(sexe), n(date_naissance), n(age_estime), n(lieu_naissance), n(nationalite), n(numero_identite), n(statut_matrimonial), n(groupe_sanguin), n(pays), n(province), n(ville), n(commune), n(quartier), n(adresse), n(profession), n(telephone), n(email), n(contact_urgence_nom), n(contact_urgence_relation), n(contact_urgence_telephone)]
    );

    auditCreate(req.user!.id, 'patients', result.rows[0].id, `Created patient ${prenom} ${nom}`);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[ERROR] Create patient:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update patient
router.put('/:id', authenticate, authorize('admin', 'medecin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, prenom, deuxieme_prenom, sexe, date_naissance, age_estime, lieu_naissance, nationalite, numero_identite, statut_matrimonial, groupe_sanguin, pays, province, ville, commune, quartier, adresse, profession, telephone, email, contact_urgence_nom, contact_urgence_relation, contact_urgence_telephone } = req.body;
    
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;

    // Fetch before state for audit
    const beforeResult = await query('SELECT * FROM patients WHERE id = $1', [req.params.id]);
    if (beforeResult.rows.length === 0) { res.status(404).json({ error: 'Patient non trouvé' }); return; }
    const before = beforeResult.rows[0];

    const result = await query(
      `UPDATE patients SET nom=$1, prenom=$2, deuxieme_prenom=$3, sexe=$4, date_naissance=$5, age_estime=$6, lieu_naissance=$7, nationalite=$8, numero_identite=$9, statut_matrimonial=$10, groupe_sanguin=$11, pays=$12, province=$13, ville=$14, commune=$15, quartier=$16, adresse=$17, profession=$18, telephone=$19, email=$20, contact_urgence_nom=$21, contact_urgence_relation=$22, contact_urgence_telephone=$23
       WHERE id = $24 
       RETURNING *`,
      [nom, prenom, n(deuxieme_prenom), n(sexe), n(date_naissance), n(age_estime), n(lieu_naissance), n(nationalite), n(numero_identite), n(statut_matrimonial), n(groupe_sanguin), n(pays), n(province), n(ville), n(commune), n(quartier), n(adresse), n(profession), n(telephone), n(email), n(contact_urgence_nom), n(contact_urgence_relation), n(contact_urgence_telephone), req.params.id]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Patient non trouvé' });
      return;
    }

    auditUpdate(req.user!.id, 'patients', Number(req.params.id), before, result.rows[0]);
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[ERROR] Update patient:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Soft delete patient
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      'UPDATE patients SET archived = TRUE WHERE id = $1 RETURNING *', 
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Patient non trouvé' });
      return;
    }

    auditDelete(req.user!.id, 'patients', Number(req.params.id), `Archived patient ${result.rows[0].prenom} ${result.rows[0].nom}`);
    
    res.json({ message: 'Patient archivé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get patient history
router.get('/:id/historique', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const patientId = req.params.id;
    
    const consultations = await query(
      `SELECT c.*, m.nom as medecin_nom, m.prenom as medecin_prenom, s.nom as service_nom 
       FROM consultations c 
       LEFT JOIN medecins m ON c.medecin_id = m.id 
       LEFT JOIN services s ON c.service_id = s.id 
       WHERE c.patient_id = $1 
       ORDER BY c.date_consultation DESC`,
      [patientId]
    );
    
    const examens = await query(
      'SELECT * FROM examens WHERE patient_id = $1 ORDER BY date_examen DESC',
      [patientId]
    );
    
    const recettes = await query(
      'SELECT * FROM recettes WHERE patient_id = $1 ORDER BY date_recette DESC',
      [patientId]
    );
    
    const documents = await query(
      'SELECT * FROM documents WHERE patient_id = $1 ORDER BY created_at DESC',
      [patientId]
    );
    
    res.json({ 
      consultations: consultations.rows, 
      examens: examens.rows, 
      recettes: recettes.rows, 
      documents: documents.rows 
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;