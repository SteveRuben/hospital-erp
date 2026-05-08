import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createProgrammeSchema } from '../middleware/validation.js';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT p.*, (SELECT COUNT(*) FROM programme_patients pp WHERE pp.programme_id = p.id AND pp.statut = 'actif') as nb_patients FROM programmes p ORDER BY p.nom`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const prog = await query('SELECT * FROM programmes WHERE id = $1', [req.params.id]);
    if (prog.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    const patients = await query(`SELECT pp.*, p.nom, p.prenom, p.sexe, p.telephone FROM programme_patients pp LEFT JOIN patients p ON pp.patient_id = p.id WHERE pp.programme_id = $1 ORDER BY pp.date_inscription DESC`, [req.params.id]);
    res.json({ ...prog.rows[0], patients: patients.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createProgrammeSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, description, type_programme } = req.body;
    const result = await query('INSERT INTO programmes (nom, description, type_programme) VALUES ($1,$2,$3) RETURNING *', [nom, description || null, type_programme || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/:id/patients', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.body;
    const result = await query('INSERT INTO programme_patients (programme_id, patient_id) VALUES ($1,$2) RETURNING *', [req.params.id, patient_id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:progId/patients/:id/statut', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;
    const extra = statut !== 'actif' ? ', date_sortie = CURRENT_DATE' : '';
    const result = await query(`UPDATE programme_patients SET statut = $1${extra} WHERE id = $2 RETURNING *`, [statut, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await query('DELETE FROM programme_patients WHERE programme_id = $1', [req.params.id]);
    await query('DELETE FROM programmes WHERE id = $1', [req.params.id]);
    res.json({ message: 'Programme supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;