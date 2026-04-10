import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, date_debut, date_fin } = req.query;
    let sql = `SELECT e.*, p.nom as patient_nom, p.prenom as patient_prenom, p.telephone as patient_telephone FROM examens e LEFT JOIN patients p ON e.patient_id = p.id WHERE 1=1`;
    const params: unknown[] = [];
    if (patient_id) { params.push(patient_id); sql += ` AND e.patient_id = $${params.length}`; }
    if (date_debut) { params.push(date_debut); sql += ` AND e.date_examen >= $${params.length}`; }
    if (date_fin) { params.push(date_fin); sql += ` AND e.date_examen <= $${params.length}`; }
    sql += ' ORDER BY e.date_examen DESC, e.id DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT e.*, p.nom as patient_nom, p.prenom as patient_prenom FROM examens e LEFT JOIN patients p ON e.patient_id = p.id WHERE e.id = $1`, [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Examen non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'laborantin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, type_examen, resultat, date_examen, montant } = req.body;
    const result = await query('INSERT INTO examens (patient_id, type_examen, resultat, date_examen, montant) VALUES ($1, $2, $3, $4, $5) RETURNING *', [patient_id, type_examen, resultat, date_examen, montant]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id', authenticate, authorize('admin', 'laborantin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type_examen, resultat, date_examen, montant } = req.body;
    const result = await query('UPDATE examens SET type_examen = $1, resultat = $2, date_examen = $3, montant = $4 WHERE id = $5 RETURNING *', [type_examen, resultat, date_examen, montant, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Examen non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('DELETE FROM examens WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Examen non trouvé' }); return; }
    res.json({ message: 'Examen supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/stats', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { debut, fin } = req.query;
    let where = '';
    const params: unknown[] = [];
    if (debut && fin) { params.push(debut, fin); where = ' WHERE date_examen >= $1 AND date_examen <= $2'; }
    const total = await query(`SELECT COUNT(*) as nb, COALESCE(SUM(montant), 0) as revenus FROM examens${where}`, params);
    const parType = await query(`SELECT type_examen, COUNT(*) as nb, COALESCE(SUM(montant), 0) as revenus FROM examens${where} GROUP BY type_examen`, params);
    res.json({ total: parseInt(total.rows[0].nb as string), revenus: parseFloat(total.rows[0].revenus as string), parType: parType.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;