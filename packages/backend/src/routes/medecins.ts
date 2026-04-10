import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get all doctors
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM medecins ORDER BY nom, prenom');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get single doctor
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM medecins WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Médecin non trouvé' });
      return;
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create doctor
router.post('/', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, prenom, specialite, telephone } = req.body;
    
    if (!nom || !prenom) {
      res.status(400).json({ error: 'Nom et prénom requis' });
      return;
    }

    const result = await query(
      'INSERT INTO medecins (nom, prenom, specialite, telephone) VALUES ($1, $2, $3, $4) RETURNING *',
      [nom, prenom, specialite, telephone]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update doctor
router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, prenom, specialite, telephone } = req.body;
    
    const result = await query(
      'UPDATE medecins SET nom = $1, prenom = $2, specialite = $3, telephone = $4 WHERE id = $5 RETURNING *',
      [nom, prenom, specialite, telephone, req.params.id]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Médecin non trouvé' });
      return;
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete doctor
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('DELETE FROM medecins WHERE id = $1 RETURNING *', [req.params.id]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Médecin non trouvé' });
      return;
    }
    
    res.json({ message: 'Médecin supprimé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;