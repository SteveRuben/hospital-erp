import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const router = Router();
const PORTAL_SECRET = process.env.JWT_SECRET || 'hospital_secret_key_2024';
import { validate, requestOtpSchema, verifyOtpSchema, bookRendezVousPortalSchema } from '../middleware/validation.js';

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
router.post('/request-otp', validate(requestOtpSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { contact } = req.body; // phone or email
    if (!contact) { res.status(400).json({ error: 'Téléphone ou email requis' }); return; }

    const patient = await prisma.patient.findFirst({
      where: {
        archived: false,
        OR: [{ telephone: contact }, { email: contact }],
      },
      select: { id: true, nom: true, prenom: true },
    });
    if (!patient) { res.status(404).json({ error: 'Aucun patient trouvé avec ce contact' }); return; }

    // SECURITY: Use crypto.randomInt() instead of Math.random() for OTP generation
    const code = String(crypto.randomInt(100000, 999999)); // 6 digits, cryptographically secure
    otpStore.set(contact, { code, patientId: patient.id, expires: Date.now() + 5 * 60 * 1000, attempts: 0 }); // 5 min

    // In production, send via SMS/email
    console.log(`[PORTAIL] OTP for ${contact}: ${code}`);

    res.json({ message: 'Code envoyé', patient_name: `${patient.prenom} ${patient.nom}` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Verify OTP — rate-limited + max attempts per OTP
router.post('/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), async (req: Request, res: Response): Promise<void> => {
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

    const patient = await prisma.patient.findUnique({
      where: { id: stored.patientId },
      select: { id: true, nom: true, prenom: true, telephone: true, email: true },
    });
    res.json({ token, patient });
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
    const rows = await prisma.rendezVous.findMany({
      where: { patientId: (req as any).patientId },
      orderBy: { dateRdv: 'desc' },
      include: {
        medecin: { select: { nom: true, prenom: true, specialite: true } },
        service: { select: { nom: true } },
      },
    });
    res.json(rows.map(r => ({
      ...r,
      medecin_nom: r.medecin?.nom ?? null,
      medecin_prenom: r.medecin?.prenom ?? null,
      specialite: r.medecin?.specialite ?? null,
      service_nom: r.service?.nom ?? null,
    })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get available slots
router.get('/creneaux', async (req: Request, res: Response): Promise<void> => {
  try {
    const { service_id, date } = req.query;
    if (!date) { res.status(400).json({ error: 'Date requise' }); return; }

    // Get existing RDVs for that date/service via raw SQL (DATE() function)
    const dateStr = String(date);
    const serviceFilter = service_id ? Prisma.sql`AND service_id = ${Number(service_id)}` : Prisma.empty;
    const existing = await prisma.$queryRaw<Array<{ date_rdv: Date }>>`
      SELECT date_rdv FROM rendez_vous
      WHERE DATE(date_rdv) = ${dateStr}::date
        AND statut NOT IN ('annule', 'absent')
        ${serviceFilter}
    `;
    const taken = existing.map(r => {
      const d = new Date(r.date_rdv);
      return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    });

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
    const rows = await prisma.service.findMany({
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get medecins list (public)
router.get('/medecins', async (_req: Request, res: Response): Promise<void> => {
  try {
    // No direct service link on medecins table, return all
    const rows = await prisma.medecin.findMany({
      select: { id: true, nom: true, prenom: true, specialite: true },
      orderBy: { nom: 'asc' },
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Book appointment
router.post('/rdv', portalAuth, validate(bookRendezVousPortalSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { service_id, medecin_id, date_rdv, motif } = req.body;
    if (!date_rdv) { res.status(400).json({ error: 'Date requise' }); return; }

    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.rendezVous.create({
      data: {
        patientId: (req as any).patientId,
        medecinId: n(medecin_id) as number | null,
        serviceId: n(service_id) as number | null,
        dateRdv: new Date(date_rdv),
        motif: n(motif) as string | null,
      },
    });
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
