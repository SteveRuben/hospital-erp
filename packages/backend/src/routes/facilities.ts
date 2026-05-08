import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createFacilitySchema } from '../middleware/validation.js';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM facilities WHERE actif = TRUE ORDER BY nom');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin'), validate(createFacilitySchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, type_facility, adresse, ville, telephone, email } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('INSERT INTO facilities (nom, code, type_facility, adresse, ville, telephone, email) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [nom, n(code), n(type_facility), n(adresse), n(ville), n(telephone), n(email)]);
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message?.includes('unique') ? 'Code déjà existant' : 'Erreur serveur' }); }
});

router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, type_facility, adresse, ville, telephone, email, actif } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('UPDATE facilities SET nom=$1, code=$2, type_facility=$3, adresse=$4, ville=$5, telephone=$6, email=$7, actif=$8::boolean WHERE id=$9 RETURNING *', [nom, n(code), n(type_facility), n(adresse), n(ville), n(telephone), n(email), actif !== false, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;