import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get all patients (with optional search)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, archived = 'false' } = req.query;
    let sql = 'SELECT * FROM patients WHERE archived = $1';
    const params: unknown[] = [archived === 'true'];
    
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (nom ILIKE $2 OR prenom ILIKE $2 OR telephone ILIKE $2 OR CAST(id AS TEXT) ILIKE $2)`;
    }
    
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[ERROR] Get patients:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get single patient
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM patients WHERE id = $1', [req.params.id]);
    
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