import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { generateReference } from '../services/reference.js';
import { validate, createOrderSchema } from '../middleware/validation.js';

const router = Router();

// Get orders for a patient
router.get('/patient/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type_order, statut } = req.query;
    let sql = `SELECT o.*, c.nom as concept_nom, c.code as concept_code, u.nom as orderer_nom, u.prenom as orderer_prenom FROM orders o LEFT JOIN concepts c ON o.concept_id = c.id LEFT JOIN users u ON o.orderer_id = u.id WHERE o.patient_id = $1`;
    const params: unknown[] = [req.params.patientId];
    if (type_order) { params.push(type_order); sql += ` AND o.type_order = $${params.length}::varchar`; }
    if (statut) { params.push(statut); sql += ` AND o.statut = $${params.length}::varchar`; }
    sql += ' ORDER BY o.created_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get all active orders (for lab, pharmacy, etc.)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type_order, statut = 'actif', page = '1', limit = '20' } = req.query;
    let sql = `SELECT o.*, c.nom as concept_nom, c.code as concept_code, u.nom as orderer_nom, u.prenom as orderer_prenom, p.nom as patient_nom, p.prenom as patient_prenom FROM orders o LEFT JOIN concepts c ON o.concept_id = c.id LEFT JOIN users u ON o.orderer_id = u.id LEFT JOIN patients p ON o.patient_id = p.id WHERE o.statut = $1::varchar`;
    const params: unknown[] = [statut];
    if (type_order) { params.push(type_order); sql += ` AND o.type_order = $${params.length}::varchar`; }
    
    const countResult = await query(`SELECT COUNT(*) as total FROM (${sql}) sub`, params);
    const total = parseInt(countResult.rows[0].total as string);
    const pg = Math.max(1, Number(page));
    const lim = Math.min(100, Math.max(1, Number(limit)));
    params.push(lim); sql += ` ORDER BY o.urgence DESC, o.created_at DESC LIMIT $${params.length}`;
    params.push((pg - 1) * lim); sql += ` OFFSET $${params.length}`;
    
    const result = await query(sql, params);
    res.json({ data: result.rows, total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create order
router.post('/', authenticate, authorize('admin', 'medecin'), validate(createOrderSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, encounter_id, concept_id, type_order, urgence, instructions, dosage, frequence, duree, voie, quantite } = req.body;
    if (!patient_id || !type_order) { res.status(400).json({ error: 'Patient et type requis' }); return; }
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const reference = await generateReference('orders');
    const result = await query(`INSERT INTO orders (reference, patient_id, encounter_id, concept_id, type_order, orderer_id, urgence, instructions, dosage, frequence, duree, voie, quantite) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [reference, patient_id, n(encounter_id), n(concept_id), type_order, req.user!.id, n(urgence) || 'routine', n(instructions), n(dosage), n(frequence), n(duree), n(voie), n(quantite)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Update order status
router.put('/:id/statut', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut, resultat } = req.body;
    const validStatuts = ['nouveau', 'actif', 'complete', 'annule', 'expire'];
    if (!validStatuts.includes(statut)) { res.status(400).json({ error: 'Statut invalide' }); return; }
    const extra = resultat ? ', resultat = $3, date_resultat = CURRENT_TIMESTAMP' : '';
    const params: unknown[] = [statut, req.params.id];
    if (resultat) params.push(resultat);
    const result = await query(`UPDATE orders SET statut = $1::varchar${extra} WHERE id = $2 RETURNING *`, params);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;