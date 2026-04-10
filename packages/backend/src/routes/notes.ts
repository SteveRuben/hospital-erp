import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT n.*, u.nom as auteur_nom, u.prenom as auteur_prenom, u.role as auteur_role FROM notes n LEFT JOIN users u ON n.auteur_id = u.id WHERE n.patient_id = $1 ORDER BY n.created_at DESC`, [req.params.patientId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, titre, contenu, type_note } = req.body;
    const result = await query(`INSERT INTO notes (patient_id, auteur_id, titre, contenu, type_note) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [patient_id, req.user!.id, titre, contenu, type_note || 'general']);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try { await query('DELETE FROM notes WHERE id = $1', [req.params.id]); res.json({ message: 'Supprimé' }); }
  catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;