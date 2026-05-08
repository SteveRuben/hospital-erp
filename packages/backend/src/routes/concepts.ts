import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createConceptSchema } from '../middleware/validation.js';

const router = Router();

// Get all concepts (with optional search/filter)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, classe, datatype, actif = 'true' } = req.query;
    let sql = 'SELECT * FROM concepts WHERE actif = $1::boolean';
    const params: unknown[] = [actif === 'true'];
    if (search) { params.push(`%${search}%`); sql += ` AND (nom ILIKE $${params.length} OR code ILIKE $${params.length})`; }
    if (classe) { params.push(classe); sql += ` AND classe = $${params.length}::varchar`; }
    if (datatype) { params.push(datatype); sql += ` AND datatype = $${params.length}::varchar`; }
    sql += ' ORDER BY classe, nom';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get single concept with names, answers, mappings
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const concept = await query('SELECT * FROM concepts WHERE id = $1', [req.params.id]);
    if (concept.rows.length === 0) { res.status(404).json({ error: 'Concept non trouvé' }); return; }
    const noms = await query('SELECT * FROM concept_noms WHERE concept_id = $1 ORDER BY langue', [req.params.id]);
    const reponses = await query('SELECT cr.*, c.nom as reponse_nom, c.code as reponse_code FROM concept_reponses cr LEFT JOIN concepts c ON cr.reponse_concept_id = c.id WHERE cr.concept_id = $1 ORDER BY cr.ordre', [req.params.id]);
    const mappings = await query('SELECT * FROM concept_mappings WHERE concept_id = $1', [req.params.id]);
    res.json({ ...concept.rows[0], noms: noms.rows, reponses: reponses.rows, mappings: mappings.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create concept
router.post('/', authenticate, authorize('admin'), validate(createConceptSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, datatype, classe, description, unite, valeur_min, valeur_max } = req.body;
    if (!nom || !datatype || !classe) { res.status(400).json({ error: 'Nom, datatype et classe requis' }); return; }
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('INSERT INTO concepts (nom, code, datatype, classe, description, unite, valeur_min, valeur_max) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [nom, n(code), datatype, classe, n(description), n(unite), n(valeur_min), n(valeur_max)]);
    res.status(201).json(result.rows[0]);
  } catch (err: any) { console.error(err); res.status(500).json({ error: err.message?.includes('unique') ? 'Code déjà existant' : 'Erreur serveur' }); }
});

// Update concept
router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, datatype, classe, description, unite, valeur_min, valeur_max, actif } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('UPDATE concepts SET nom=$1, code=$2, datatype=$3, classe=$4, description=$5, unite=$6, valeur_min=$7, valeur_max=$8, actif=$9::boolean WHERE id=$10 RETURNING *', [nom, n(code), datatype, classe, n(description), n(unite), n(valeur_min), n(valeur_max), actif !== false, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Add concept mapping
router.post('/:id/mappings', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { source, code_externe } = req.body;
    const result = await query('INSERT INTO concept_mappings (concept_id, source, code_externe) VALUES ($1,$2,$3) RETURNING *', [req.params.id, source, code_externe]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Add concept answer
router.post('/:id/reponses', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reponse_concept_id, ordre } = req.body;
    const result = await query('INSERT INTO concept_reponses (concept_id, reponse_concept_id, ordre) VALUES ($1,$2,$3) RETURNING *', [req.params.id, reponse_concept_id, ordre || 0]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;