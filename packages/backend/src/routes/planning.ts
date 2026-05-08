import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createPlanningSchema, createBlocageSchema } from '../middleware/validation.js';

const router = Router();

// Get planning for a medecin
router.get('/medecin/:medecinId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT p.*, s.nom as service_nom FROM planning_medecins p LEFT JOIN services s ON p.service_id = s.id WHERE p.medecin_id = $1 AND p.actif = TRUE ORDER BY p.jour_semaine, p.heure_debut`, [req.params.medecinId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create planning slot
router.post('/', authenticate, authorize('admin', 'medecin'), validate(createPlanningSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medecin_id, service_id, jour_semaine, heure_debut, heure_fin, duree_creneau } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('INSERT INTO planning_medecins (medecin_id, service_id, jour_semaine, heure_debut, heure_fin, duree_creneau) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [medecin_id, n(service_id), jour_semaine, heure_debut, heure_fin, duree_creneau || 30]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Delete planning slot
router.delete('/:id', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try { await query('UPDATE planning_medecins SET actif = FALSE WHERE id = $1', [req.params.id]); res.json({ message: 'Supprimé' }); }
  catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get blocages for a medecin
router.get('/blocages/:medecinId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM planning_blocages WHERE medecin_id = $1 AND date_fin >= CURRENT_TIMESTAMP ORDER BY date_debut', [req.params.medecinId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create blocage
router.post('/blocages', authenticate, authorize('admin', 'medecin'), validate(createBlocageSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medecin_id, date_debut, date_fin, motif } = req.body;
    const result = await query('INSERT INTO planning_blocages (medecin_id, date_debut, date_fin, motif) VALUES ($1,$2,$3,$4) RETURNING *', [medecin_id, date_debut, date_fin, motif || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get available slots for a date + medecin (uses planning)
router.get('/creneaux-disponibles', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medecin_id, date } = req.query;
    if (!medecin_id || !date) { res.status(400).json({ error: 'medecin_id et date requis' }); return; }

    const d = new Date(date as string);
    const jourSemaine = d.getDay(); // 0=dimanche

    // Get planning for this day
    const planning = await query('SELECT * FROM planning_medecins WHERE medecin_id = $1 AND jour_semaine = $2 AND actif = TRUE', [medecin_id, jourSemaine]);
    if (planning.rows.length === 0) { res.json([]); return; }

    // Check blocages
    const blocages = await query('SELECT * FROM planning_blocages WHERE medecin_id = $1 AND $2::date BETWEEN DATE(date_debut) AND DATE(date_fin)', [medecin_id, date]);
    if (blocages.rows.length > 0) { res.json([]); return; } // Blocked day

    // Get existing RDV for this date
    const existingRdv = await query("SELECT date_rdv FROM rendez_vous WHERE medecin_id = $1 AND DATE(date_rdv) = $2::date AND statut NOT IN ('annule', 'absent')", [medecin_id, date]);
    const takenSlots = existingRdv.rows.map((r: any) => {
      const t = new Date(r.date_rdv);
      return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    });

    // Generate available slots
    const slots: string[] = [];
    for (const p of planning.rows) {
      const [startH, startM] = (p.heure_debut as string).split(':').map(Number);
      const [endH, endM] = (p.heure_fin as string).split(':').map(Number);
      const startMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;
      const duration = p.duree_creneau || 30;

      for (let m = startMin; m + duration <= endMin; m += duration) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        const slot = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        if (!takenSlots.includes(slot)) slots.push(slot);
      }
    }

    res.json(slots);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;