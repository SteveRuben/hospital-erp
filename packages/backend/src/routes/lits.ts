import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createPavillonSchema, createLitSchema } from '../middleware/validation.js';

const router = Router();

// === PAVILLONS ===
router.get('/pavillons', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT p.*, s.nom as service_nom, (SELECT COUNT(*) FROM lits l WHERE l.pavillon_id = p.id) as nb_lits, (SELECT COUNT(*) FROM lits l WHERE l.pavillon_id = p.id AND l.statut = 'disponible') as lits_disponibles FROM pavillons p LEFT JOIN services s ON p.service_id = s.id ORDER BY p.nom`);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/pavillons', authenticate, authorize('admin'), validate(createPavillonSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, etage, service_id, capacite, description } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('INSERT INTO pavillons (nom, etage, service_id, capacite, description) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, n(etage), n(service_id), capacite || 0, n(description)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === LITS ===
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pavillon_id, statut } = req.query;
    let sql = `SELECT l.*, p.nom as pavillon_nom, p.etage FROM lits l LEFT JOIN pavillons p ON l.pavillon_id = p.id WHERE 1=1`;
    const params: unknown[] = [];
    if (pavillon_id) { params.push(pavillon_id); sql += ` AND l.pavillon_id = $${params.length}`; }
    if (statut) { params.push(statut); sql += ` AND l.statut = $${params.length}`; }
    sql += ' ORDER BY p.nom, l.numero';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin'), validate(createLitSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pavillon_id, numero, type_lit } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('INSERT INTO lits (pavillon_id, numero, type_lit) VALUES ($1,$2,$3) RETURNING *', [pavillon_id, numero, n(type_lit) || 'standard']);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id/statut', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;
    const result = await query('UPDATE lits SET statut = $1 WHERE id = $2 RETURNING *', [statut, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Lit non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === HOSPITALISATIONS ===
router.get('/hospitalisations', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut = 'active' } = req.query;
    const result = await query(`SELECT h.*, p.nom as patient_nom, p.prenom as patient_prenom, l.numero as lit_numero, pav.nom as pavillon_nom, m.nom as medecin_nom, m.prenom as medecin_prenom, s.nom as service_nom FROM hospitalisations h LEFT JOIN patients p ON h.patient_id = p.id LEFT JOIN lits l ON h.lit_id = l.id LEFT JOIN pavillons pav ON l.pavillon_id = pav.id LEFT JOIN medecins m ON h.medecin_id = m.id LEFT JOIN services s ON h.service_id = s.id WHERE h.statut = $1 ORDER BY h.date_admission DESC`, [statut]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/hospitalisations', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, lit_id, medecin_id, service_id, motif, notes } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    // Mark bed as occupied
    if (lit_id) await query("UPDATE lits SET statut = 'occupe' WHERE id = $1", [lit_id]);
    const result = await query('INSERT INTO hospitalisations (patient_id, lit_id, medecin_id, service_id, motif, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [patient_id, n(lit_id), n(medecin_id), n(service_id), n(motif), n(notes)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/hospitalisations/:id/sortie', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hosp = await query('SELECT lit_id FROM hospitalisations WHERE id = $1', [req.params.id]);
    if (hosp.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    if (hosp.rows[0].lit_id) await query("UPDATE lits SET statut = 'disponible' WHERE id = $1", [hosp.rows[0].lit_id]);
    const result = await query("UPDATE hospitalisations SET statut = 'sortie', date_sortie = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *", [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Stats
router.get('/stats', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const totalLits = await query('SELECT COUNT(*) as total FROM lits');
    const disponibles = await query("SELECT COUNT(*) as total FROM lits WHERE statut = 'disponible'");
    const occupes = await query("SELECT COUNT(*) as total FROM lits WHERE statut = 'occupe'");
    const hospActives = await query("SELECT COUNT(*) as total FROM hospitalisations WHERE statut = 'active'");
    res.json({ totalLits: parseInt(totalLits.rows[0].total as string), disponibles: parseInt(disponibles.rows[0].total as string), occupes: parseInt(occupes.rows[0].total as string), hospitalisations: parseInt(hospActives.rows[0].total as string) });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;