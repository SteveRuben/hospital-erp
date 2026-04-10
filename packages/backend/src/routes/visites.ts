import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get active visits
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut = 'active', service_id } = req.query;
    let sql = `SELECT v.*, p.nom as patient_nom, p.prenom as patient_prenom, p.sexe, p.telephone as patient_telephone, s.nom as service_nom FROM visites v LEFT JOIN patients p ON v.patient_id = p.id LEFT JOIN services s ON v.service_id = s.id WHERE v.statut = $1`;
    const params: unknown[] = [statut];
    if (service_id) { params.push(service_id); sql += ` AND v.service_id = $${params.length}`; }
    sql += ' ORDER BY v.date_debut DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { console.error('[ERROR] Get visites:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Start visit
router.post('/', authenticate, authorize('admin', 'medecin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, service_id, type_visite, notes } = req.body;
    if (!patient_id) { res.status(400).json({ error: 'Patient requis' }); return; }
    // Check no active visit for this patient
    const existing = await query("SELECT id FROM visites WHERE patient_id = $1 AND statut = 'active'", [patient_id]);
    if (existing.rows.length > 0) { res.status(400).json({ error: 'Ce patient a déjà une visite active' }); return; }
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query(`INSERT INTO visites (patient_id, service_id, type_visite, notes) VALUES ($1,$2,$3,$4) RETURNING *`, [patient_id, n(service_id), n(type_visite) || 'ambulatoire', n(notes)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error('[ERROR] Create visite:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// End visit
router.put('/:id/terminer', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query("UPDATE visites SET statut = 'terminee', date_fin = CURRENT_TIMESTAMP WHERE id = $1 AND statut = 'active' RETURNING *", [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Visite non trouvée ou déjà terminée' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Stats
router.get('/stats', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const actives = await query("SELECT COUNT(*) as total FROM visites WHERE statut = 'active'");
    const today = await query("SELECT COUNT(*) as total FROM visites WHERE DATE(date_debut) = CURRENT_DATE");
    const parService = await query("SELECT s.nom, COUNT(v.id) as total FROM services s LEFT JOIN visites v ON v.service_id = s.id AND v.statut = 'active' GROUP BY s.id, s.nom ORDER BY total DESC");
    const parType = await query("SELECT type_visite, COUNT(*) as total FROM visites WHERE statut = 'active' GROUP BY type_visite");
    res.json({ actives: parseInt(actives.rows[0].total as string), today: parseInt(today.rows[0].total as string), parService: parService.rows, parType: parType.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;