import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get queue for a service (or all)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { service_id, statut } = req.query;
    let sql = `SELECT f.*, p.nom as patient_nom, p.prenom as patient_prenom, p.sexe, p.telephone as patient_telephone, s.nom as service_nom FROM file_attente f LEFT JOIN patients p ON f.patient_id = p.id LEFT JOIN services s ON f.service_id = s.id WHERE DATE(f.date_arrivee) = CURRENT_DATE`;
    const params: unknown[] = [];
    if (service_id) { params.push(service_id); sql += ` AND f.service_id = $${params.length}`; }
    if (statut) { params.push(statut); sql += ` AND f.statut = $${params.length}`; }
    sql += ' ORDER BY f.priorite ASC, f.numero_ordre ASC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { console.error('[ERROR] Get file attente:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Add patient to queue
router.post('/', authenticate, authorize('admin', 'medecin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, service_id, priorite, notes } = req.body;
    if (!patient_id || !service_id) { res.status(400).json({ error: 'Patient et service requis' }); return; }
    // Get next order number for this service today
    const orderResult = await query("SELECT COALESCE(MAX(numero_ordre), 0) + 1 as next_order FROM file_attente WHERE service_id = $1 AND DATE(date_arrivee) = CURRENT_DATE", [service_id]);
    const numero_ordre = orderResult.rows[0].next_order;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query(`INSERT INTO file_attente (patient_id, service_id, priorite, numero_ordre, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [patient_id, service_id, n(priorite) || 'normal', numero_ordre, n(notes)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error('[ERROR] Add to queue:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Update status (en_attente -> en_cours -> termine)
router.put('/:id/statut', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;
    const validStatuts = ['en_attente', 'en_cours', 'termine', 'absent'];
    if (!validStatuts.includes(statut)) { res.status(400).json({ error: 'Statut invalide' }); return; }
    const extra = statut === 'en_cours' ? ', date_prise_en_charge = CURRENT_TIMESTAMP' : '';
    const result = await query(`UPDATE file_attente SET statut = $1${extra} WHERE id = $2 RETURNING *`, [statut, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Delete from queue
router.delete('/:id', authenticate, authorize('admin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await query('DELETE FROM file_attente WHERE id = $1', [req.params.id]);
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Stats
router.get('/stats', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const enAttente = await query("SELECT COUNT(*) as total FROM file_attente WHERE statut = 'en_attente' AND DATE(date_arrivee) = CURRENT_DATE");
    const enCours = await query("SELECT COUNT(*) as total FROM file_attente WHERE statut = 'en_cours' AND DATE(date_arrivee) = CURRENT_DATE");
    const termines = await query("SELECT COUNT(*) as total FROM file_attente WHERE statut = 'termine' AND DATE(date_arrivee) = CURRENT_DATE");
    const parService = await query("SELECT s.nom, COUNT(f.id) as en_attente FROM services s LEFT JOIN file_attente f ON f.service_id = s.id AND f.statut = 'en_attente' AND DATE(f.date_arrivee) = CURRENT_DATE GROUP BY s.id, s.nom ORDER BY en_attente DESC");
    res.json({ enAttente: parseInt(enAttente.rows[0].total as string), enCours: parseInt(enCours.rows[0].total as string), termines: parseInt(termines.rows[0].total as string), parService: parService.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;