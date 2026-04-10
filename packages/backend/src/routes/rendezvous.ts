import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get all rendez-vous (with optional filters)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date, medecin_id, service_id, statut } = req.query;
    let sql = `
      SELECT r.*, 
             p.nom as patient_nom, p.prenom as patient_prenom,
             m.nom as medecin_nom, m.prenom as medecin_prenom,
             s.nom as service_nom
      FROM rendez_vous r
      LEFT JOIN patients p ON r.patient_id = p.id
      LEFT JOIN medecins m ON r.medecin_id = m.id
      LEFT JOIN services s ON r.service_id = s.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (date) {
      params.push(`${date}`);
      sql += ` AND DATE(r.date_rdv) = $${params.length}`;
    }
    if (medecin_id) {
      params.push(medecin_id);
      sql += ` AND r.medecin_id = $${params.length}`;
    }
    if (service_id) {
      params.push(service_id);
      sql += ` AND r.service_id = $${params.length}`;
    }
    if (statut) {
      params.push(statut);
      sql += ` AND r.statut = $${params.length}`;
    }

    sql += ' ORDER BY r.date_rdv ASC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get today's rendez-vous
router.get('/today', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`
      SELECT r.*, 
             p.nom as patient_nom, p.prenom as patient_prenom,
             m.nom as medecin_nom, m.prenom as medecin_prenom,
             s.nom as service_nom
      FROM rendez_vous r
      LEFT JOIN patients p ON r.patient_id = p.id
      LEFT JOIN medecins m ON r.medecin_id = m.id
      LEFT JOIN services s ON r.service_id = s.id
      WHERE DATE(r.date_rdv) = CURRENT_DATE
      ORDER BY r.date_rdv ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get single rendez-vous
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`
      SELECT r.*, 
             p.nom as patient_nom, p.prenom as patient_prenom,
             m.nom as medecin_nom, m.prenom as medecin_prenom,
             s.nom as service_nom
      FROM rendez_vous r
      LEFT JOIN patients p ON r.patient_id = p.id
      LEFT JOIN medecins m ON r.medecin_id = m.id
      LEFT JOIN services s ON r.service_id = s.id
      WHERE r.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Rendez-vous non trouvé' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create rendez-vous
router.post('/', authenticate, authorize('admin', 'medecin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, service_id, date_rdv, motif, notes } = req.body;

    if (!patient_id || !medecin_id || !date_rdv) {
      res.status(400).json({ error: 'Patient, médecin et date requis' });
      return;
    }

    const result = await query(
      `INSERT INTO rendez_vous (patient_id, medecin_id, service_id, date_rdv, motif, notes) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [patient_id, medecin_id, service_id, date_rdv, motif, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update rendez-vous
router.put('/:id', authenticate, authorize('admin', 'medecin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, service_id, date_rdv, motif, notes, statut } = req.body;

    const result = await query(
      `UPDATE rendez_vous 
       SET patient_id = $1, medecin_id = $2, service_id = $3, date_rdv = $4, motif = $5, notes = $6, statut = COALESCE($7, statut)
       WHERE id = $8 
       RETURNING *`,
      [patient_id, medecin_id, service_id, date_rdv, motif, notes, statut, req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Rendez-vous non trouvé' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update statut only
router.put('/:id/statut', authenticate, authorize('admin', 'medecin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;

    if (!statut) {
      res.status(400).json({ error: 'Statut requis' });
      return;
    }

    const validStatuts = ['planifie', 'confirme', 'en_cours', 'termine', 'annule', 'absent'];
    if (!validStatuts.includes(statut)) {
      res.status(400).json({ error: 'Statut invalide' });
      return;
    }

    const result = await query(
      'UPDATE rendez_vous SET statut = $1 WHERE id = $2 RETURNING *',
      [statut, req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Rendez-vous non trouvé' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete rendez-vous
router.delete('/:id', authenticate, authorize('admin', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('DELETE FROM rendez_vous WHERE id = $1 RETURNING *', [req.params.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Rendez-vous non trouvé' });
      return;
    }

    res.json({ message: 'Rendez-vous supprimé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;