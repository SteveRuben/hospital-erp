import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Detect duplicates
router.get('/duplicates', authenticate, authorize('admin'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`
      SELECT p1.id as id1, p1.nom as nom1, p1.prenom as prenom1, p1.date_naissance as dob1, p1.telephone as tel1,
             p2.id as id2, p2.nom as nom2, p2.prenom as prenom2, p2.date_naissance as dob2, p2.telephone as tel2
      FROM patients p1
      JOIN patients p2 ON p1.id < p2.id
        AND LOWER(p1.nom) = LOWER(p2.nom)
        AND LOWER(p1.prenom) = LOWER(p2.prenom)
        AND p1.archived = FALSE AND p2.archived = FALSE
      ORDER BY p1.nom, p1.prenom
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Merge patients
router.post('/merge', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { keep_id, merge_id } = req.body;
    if (!keep_id || !merge_id || keep_id === merge_id) { res.status(400).json({ error: 'IDs invalides' }); return; }

    // Transfer all data from merge_id to keep_id
    const tables = [
      'consultations', 'recettes', 'examens', 'rendez_vous', 'vitaux',
      'allergies', 'pathologies', 'prescriptions', 'ordonnances', 'vaccinations',
      'notes', 'alertes', 'encounters', 'observations', 'orders',
      'visites', 'hospitalisations', 'dispensations', 'documents'
    ];

    for (const table of tables) {
      try {
        await query(`UPDATE ${table} SET patient_id = $1 WHERE patient_id = $2`, [keep_id, merge_id]);
      } catch { /* table might not exist or no patient_id column */ }
    }

    // Archive the merged patient
    await query('UPDATE patients SET archived = TRUE WHERE id = $1', [merge_id]);

    // Audit log
    await query('INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user!.id, 'patient_merge', 'patients', keep_id, `Merged patient #${merge_id} into #${keep_id}`]);

    console.log(`[AUDIT][MERGE] User ${req.user!.username} merged patient #${merge_id} into #${keep_id}`);
    res.json({ message: `Patient #${merge_id} fusionné dans #${keep_id}` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;