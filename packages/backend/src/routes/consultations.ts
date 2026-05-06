import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { getPaginationParams, paginatedResponse } from '../middleware/pagination.js';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, service_id, date_debut, date_fin } = req.query;
    const { page, limit, offset } = getPaginationParams(req);
    let sql = `SELECT c.*, p.nom as patient_nom, p.prenom as patient_prenom, m.nom as medecin_nom, m.prenom as medecin_prenom, m.specialite, s.nom as service_nom FROM consultations c LEFT JOIN patients p ON c.patient_id = p.id LEFT JOIN medecins m ON c.medecin_id = m.id LEFT JOIN services s ON c.service_id = s.id WHERE 1=1`;
    const params: unknown[] = [];
    if (patient_id) { params.push(patient_id); sql += ` AND c.patient_id = $${params.length}`; }
    if (medecin_id) { params.push(medecin_id); sql += ` AND c.medecin_id = $${params.length}`; }
    if (service_id) { params.push(service_id); sql += ` AND c.service_id = $${params.length}`; }
    if (date_debut) { params.push(date_debut); sql += ` AND c.date_consultation >= $${params.length}`; }
    if (date_fin) { params.push(date_fin); sql += ` AND c.date_consultation <= $${params.length}`; }
    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const total = parseInt(countResult.rows[0].total as string);
    params.push(limit); sql += ` ORDER BY c.date_consultation DESC LIMIT $${params.length}`;
    params.push(offset); sql += ` OFFSET $${params.length}`;
    const result = await query(sql, params);
    res.json(paginatedResponse(result.rows, total, { page, limit, offset }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT c.*, p.nom as patient_nom, p.prenom as patient_prenom, m.nom as medecin_nom, m.prenom as medecin_prenom, s.nom as service_nom FROM consultations c LEFT JOIN patients p ON c.patient_id = p.id LEFT JOIN medecins m ON c.medecin_id = m.id LEFT JOIN services s ON c.service_id = s.id WHERE c.id = $1`, [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Consultation non trouvée' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, service_id, diagnostic, traitement, notes } = req.body;
    const result = await query(`INSERT INTO consultations (patient_id, medecin_id, service_id, diagnostic, traitement, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [patient_id, medecin_id, service_id, diagnostic, traitement, notes]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { diagnostic, traitement, notes } = req.body;
    const result = await query('UPDATE consultations SET diagnostic = $1, traitement = $2, notes = $3 WHERE id = $4 RETURNING *', [diagnostic, traitement, notes, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Consultation non trouvée' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('DELETE FROM consultations WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Consultation non trouvée' }); return; }
    res.json({ message: 'Consultation supprimée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;