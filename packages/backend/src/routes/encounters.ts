import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { generateReference } from '../services/reference.js';

const router = Router();

// Get encounter types
router.get('/types', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try { const result = await query('SELECT * FROM encounter_types ORDER BY nom'); res.json(result.rows); }
  catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get encounters for a patient
router.get('/patient/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT e.*, et.nom as type_nom, u.nom as provider_nom, u.prenom as provider_prenom, s.nom as service_nom FROM encounters e LEFT JOIN encounter_types et ON e.encounter_type_id = et.id LEFT JOIN users u ON e.provider_id = u.id LEFT JOIN services s ON e.service_id = s.id WHERE e.patient_id = $1 ORDER BY e.date_encounter DESC`, [req.params.patientId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get single encounter with observations
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const enc = await query(`SELECT e.*, et.nom as type_nom, u.nom as provider_nom, u.prenom as provider_prenom, p.nom as patient_nom, p.prenom as patient_prenom FROM encounters e LEFT JOIN encounter_types et ON e.encounter_type_id = et.id LEFT JOIN users u ON e.provider_id = u.id LEFT JOIN patients p ON e.patient_id = p.id WHERE e.id = $1`, [req.params.id]);
    if (enc.rows.length === 0) { res.status(404).json({ error: 'Encounter non trouvé' }); return; }
    const obs = await query(`SELECT o.*, c.nom as concept_nom, c.code as concept_code, c.datatype, c.unite, cv.nom as valeur_coded_nom FROM observations o LEFT JOIN concepts c ON o.concept_id = c.id LEFT JOIN concepts cv ON o.valeur_coded = cv.id WHERE o.encounter_id = $1 AND o.voided = FALSE ORDER BY o.date_obs`, [req.params.id]);
    res.json({ ...enc.rows[0], observations: obs.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create encounter with observations
router.post('/', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, encounter_type_id, visite_id, service_id, notes, observations } = req.body;
    if (!patient_id || !encounter_type_id) { res.status(400).json({ error: 'Patient et type requis' }); return; }
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const reference = await generateReference('encounters');
    const enc = await query(`INSERT INTO encounters (reference, patient_id, encounter_type_id, visite_id, provider_id, service_id, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [reference, patient_id, encounter_type_id, n(visite_id), req.user!.id, n(service_id), n(notes)]);
    const encId = enc.rows[0].id;

    // Insert observations
    if (observations && Array.isArray(observations)) {
      for (const obs of observations) {
        if (!obs.concept_id) continue;
        await query(`INSERT INTO observations (encounter_id, patient_id, concept_id, valeur_numerique, valeur_texte, valeur_date, valeur_coded, valeur_boolean, commentaire, provider_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [encId, patient_id, obs.concept_id, n(obs.valeur_numerique), n(obs.valeur_texte), n(obs.valeur_date), n(obs.valeur_coded), obs.valeur_boolean ?? null, n(obs.commentaire), req.user!.id]);
      }
    }

    res.status(201).json(enc.rows[0]);
  } catch (err) { console.error('[ERROR] Create encounter:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Add observation to existing encounter
router.post('/:id/observations', authenticate, authorize('admin', 'medecin', 'laborantin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const enc = await query('SELECT patient_id FROM encounters WHERE id = $1', [req.params.id]);
    if (enc.rows.length === 0) { res.status(404).json({ error: 'Encounter non trouvé' }); return; }
    const { concept_id, valeur_numerique, valeur_texte, valeur_date, valeur_coded, valeur_boolean, commentaire } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query(`INSERT INTO observations (encounter_id, patient_id, concept_id, valeur_numerique, valeur_texte, valeur_date, valeur_coded, valeur_boolean, commentaire, provider_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, enc.rows[0].patient_id, concept_id, n(valeur_numerique), n(valeur_texte), n(valeur_date), n(valeur_coded), valeur_boolean ?? null, n(commentaire), req.user!.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;