import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import { query } from '../config/db.js';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const router = Router();
const PORTAL_SECRET = process.env.JWT_SECRET || 'hospital_secret_key_2024';

// Store OTPs in memory (in production, use Redis)
const otpStore = new Map<string, { code: string; patientId: number; expires: number; attempts: number }>();

// Rate limit on OTP verification (brute-force protection)
const otpVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // max 5 attempts per IP per 5 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans 5 minutes' },
});

// Request OTP
router.post('/request-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contact } = req.body; // phone or email
    if (!contact) { res.status(400).json({ error: 'Téléphone ou email requis' }); return; }

    const result = await query('SELECT id, nom, prenom FROM patients WHERE (telephone = $1 OR email = $1) AND archived = FALSE', [contact]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Aucun patient trouvé avec ce contact' }); return; }

    const patient = result.rows[0];
    // SECURITY: Use crypto.randomInt() instead of Math.random() for OTP generation
    const code = String(crypto.randomInt(100000, 999999)); // 6 digits, cryptographically secure
    otpStore.set(contact, { code, patientId: patient.id, expires: Date.now() + 5 * 60 * 1000, attempts: 0 }); // 5 min

    // In production, send via SMS/email
    console.log(`[PORTAIL] OTP for ${contact}: ${code}`);

    res.json({ message: 'Code envoyé', patient_name: `${patient.prenom} ${patient.nom}` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Verify OTP — rate-limited + max attempts per OTP
router.post('/verify-otp', otpVerifyLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { contact, code } = req.body;
    const stored = otpStore.get(contact);

    if (!stored || stored.expires < Date.now()) {
      otpStore.delete(contact);
      res.status(401).json({ error: 'Code expiré ou invalide' });
      return;
    }

    // Max 5 attempts per OTP before invalidation
    stored.attempts++;
    if (stored.attempts > 5) {
      otpStore.delete(contact);
      res.status(401).json({ error: 'Trop de tentatives, demandez un nouveau code' });
      return;
    }

    if (stored.code !== code) { res.status(401).json({ error: 'Code incorrect' }); return; }

    otpStore.delete(contact);
    const token = jwt.sign(
      { patientId: stored.patientId, type: 'portal' },
      PORTAL_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: 'hospital-erp' }
    );

    const patient = await query('SELECT id, nom, prenom, telephone, email FROM patients WHERE id = $1', [stored.patientId]);
    res.json({ token, patient: patient.rows[0] });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Middleware for portal auth — SECURITY: pin algorithm to HS256
const portalAuth = (req: Request, res: Response, next: () => void) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) { res.status(401).json({ error: 'Token requis' }); return; }
  try {
    const decoded = jwt.verify(token, PORTAL_SECRET, { algorithms: ['HS256'] }) as { patientId: number; type: string };
    if (decoded.type !== 'portal') { res.status(401).json({ error: 'Token invalide' }); return; }
    (req as any).patientId = decoded.patientId;
    next();
  } catch { res.status(401).json({ error: 'Token expiré' }); }
};

// Get my appointments
router.get('/mes-rdv', portalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT r.*, m.nom as medecin_nom, m.prenom as medecin_prenom, m.specialite, s.nom as service_nom FROM rendez_vous r LEFT JOIN medecins m ON r.medecin_id = m.id LEFT JOIN services s ON r.service_id = s.id WHERE r.patient_id = $1 ORDER BY r.date_rdv DESC`, [(req as any).patientId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get available slots
router.get('/creneaux', async (req: Request, res: Response): Promise<void> => {
  try {
    const { service_id, date } = req.query;
    if (!date) { res.status(400).json({ error: 'Date requise' }); return; }

    // Get existing RDVs for that date/service
    let sql = `SELECT date_rdv FROM rendez_vous WHERE DATE(date_rdv) = $1 AND statut NOT IN ('annule', 'absent')`;
    const params: unknown[] = [date];
    if (service_id) { params.push(service_id); sql += ` AND service_id = $${params.length}`; }
    const existing = await query(sql, params);
    const taken = existing.rows.map((r: { date_rdv: string }) => new Date(r.date_rdv).getHours() + ':' + String(new Date(r.date_rdv).getMinutes()).padStart(2, '0'));

    // Generate slots 8h-17h, every 30min
    const slots: string[] = [];
    for (let h = 8; h < 17; h++) {
      for (const m of ['00', '30']) {
        const slot = `${h}:${m}`;
        if (!taken.includes(slot)) slots.push(slot);
      }
    }

    res.json(slots);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get services list (public)
router.get('/services', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT id, nom FROM services ORDER BY nom');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get medecins list (public)
router.get('/medecins', async (req: Request, res: Response): Promise<void> => {
  try {
    const { service_id } = req.query;
    let sql = 'SELECT id, nom, prenom, specialite FROM medecins';
    const params: unknown[] = [];
    // No direct service link on medecins table, return all
    sql += ' ORDER BY nom';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Book appointment
router.post('/rdv', portalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { service_id, medecin_id, date_rdv, motif } = req.body;
    if (!date_rdv) { res.status(400).json({ error: 'Date requise' }); return; }

    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query(`INSERT INTO rendez_vous (patient_id, medecin_id, service_id, date_rdv, motif) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [(req as any).patientId, n(medecin_id), n(service_id), date_rdv, n(motif)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;