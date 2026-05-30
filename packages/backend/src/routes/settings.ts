import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { invalidateCache } from '../services/reference.js';
import { invalidateSessionTimeoutCache } from '../services/session.js';
import { validateUpload } from '../middleware/upload-validation.js';
import { logAudit } from '../services/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brandingUploadDir = path.resolve(__dirname, '../../uploads/branding');
if (!fs.existsSync(brandingUploadDir)) fs.mkdirSync(brandingUploadDir, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, brandingUploadDir),
  // The filename is overwritten on every upload — only one logo per tenant.
  filename: (_req, file, cb) => cb(null, `logo${path.extname(file.originalname).toLowerCase()}`),
});
const LOGO_MIMES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB ceiling
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

const VALID_THEMES = ['cds-blue', 'medical-green', 'royal-purple', 'coral', 'teal', 'slate'] as const;

const router = Router();

/**
 * Public branding endpoint — no auth. Used by the login page and the app
 * shell to render the hospital identity before the user signs in. Returns
 * only the fields safe to expose pre-auth (name, logo URL, theme).
 */
router.get('/branding', asyncHandler(async (_req, res) => {
  const rows = await prisma.setting.findMany({
    where: { cle: { in: ['nom_etablissement', 'logo_url', 'theme', 'code_pays', 'devise'] } },
    select: { cle: true, valeur: true },
  });
  const map: Record<string, string> = {};
  for (const row of rows) map[row.cle] = row.valeur;
  res.json({
    nom_etablissement: map.nom_etablissement || 'Hospital ERP',
    logo_url: map.logo_url || null,
    theme: VALID_THEMES.includes(map.theme as typeof VALID_THEMES[number]) ? map.theme : 'cds-blue',
    // Country code + currency are needed app-wide for phone formatting and
    // money display, so they ship alongside the visual branding payload.
    code_pays: map.code_pays || '',
    devise: map.devise || 'XOF',
  });
}));

/**
 * Upload the establishment logo. Admin-only. Magic-byte validated against
 * common web image formats. SVG passes through `'image/svg+xml'` which
 * file-type may not detect — we keep the extension+declared-mime guard for
 * that case (validateUpload returns 400 if no magic bytes found).
 */
router.post('/logo', authenticate, authorize('admin'), logoUpload.single('file'), validateUpload(LOGO_MIMES), asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'Fichier requis' }); return; }

  const url = `/uploads/branding/${req.file.filename}`;
  await prisma.setting.upsert({
    where: { cle: 'logo_url' },
    create: { cle: 'logo_url', valeur: url, categorie: 'branding', description: 'URL du logo de l\'établissement' },
    update: { valeur: url, updatedAt: new Date() },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'update',
    tableName: 'settings',
    details: `logo_url updated to ${url} (${req.file.size} bytes, ${req.file.mimetype})`,
  });

  invalidateCache();
  res.json({ logo_url: url });
}));

/**
 * Remove the logo. Admin-only. Deletes the file on disk and clears the setting.
 */
router.delete('/logo', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const current = await prisma.setting.findUnique({ where: { cle: 'logo_url' }, select: { valeur: true } });
  if (current?.valeur) {
    const filePath = path.resolve(__dirname, '../..', current.valeur.replace(/^\//, ''));
    if (filePath.startsWith(brandingUploadDir) && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (err) { console.warn('[LOGO] unlink failed:', err); }
    }
  }
  await prisma.setting.upsert({
    where: { cle: 'logo_url' },
    create: { cle: 'logo_url', valeur: '', categorie: 'branding' },
    update: { valeur: '', updatedAt: new Date() },
  });
  await logAudit({ userId: req.user!.id, action: 'delete', tableName: 'settings', details: 'logo_url cleared' });
  invalidateCache();
  res.json({ message: 'Logo supprimé' });
}));

// Get all settings (admin only)
router.get('/', authenticate, authorize('admin'), asyncHandler(async (_req, res) => {
  const rows = await prisma.setting.findMany({ orderBy: [{ categorie: 'asc' }, { cle: 'asc' }] });
  res.json(rows);
}));

// Get settings by category
router.get('/categorie/:categorie', authenticate, asyncHandler(async (req, res) => {
  const rows = await prisma.setting.findMany({
    where: { categorie: req.params.categorie },
    select: { cle: true, valeur: true },
  });
  const map: Record<string, string> = {};
  for (const row of rows) map[row.cle] = row.valeur;
  res.json(map);
}));

// Get a single setting value
router.get('/:cle', authenticate, asyncHandler(async (req, res) => {
  const row = await prisma.setting.findUnique({
    where: { cle: req.params.cle },
    select: { valeur: true },
  });
  if (!row) { res.status(404).json({ error: 'Paramètre non trouvé' }); return; }
  res.json({ cle: req.params.cle, valeur: row.valeur });
}));

// Update a setting (admin only)
router.put('/:cle', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res) => {
  const { valeur } = req.body;
  if (valeur === undefined || valeur === null) { res.status(400).json({ error: 'Valeur requise' }); return; }

  // Reject invalid theme values — the frontend would render an unstyled UI otherwise.
  if (req.params.cle === 'theme' && !VALID_THEMES.includes(String(valeur) as typeof VALID_THEMES[number])) {
    res.status(400).json({ error: `Thème invalide. Valeurs autorisées: ${VALID_THEMES.join(', ')}` });
    return;
  }

  const updated = await prisma.setting.upsert({
    where: { cle: req.params.cle },
    create: { cle: req.params.cle, valeur: String(valeur) },
    update: { valeur: String(valeur), updatedAt: new Date() },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'update',
    tableName: 'settings',
    details: `${req.params.cle} = ${String(valeur).substring(0, 200)}`,
  });

  invalidateCache();
  // Session timeout is read via a 60 s in-memory cache in session.ts —
  // bust it now so an admin's edit takes effect on the very next request
  // instead of waiting for the TTL.
  if (req.params.cle === 'session_timeout_minutes') invalidateSessionTimeoutCache();
  res.json(updated);
}));

// Bulk update settings (admin only) — single transaction so a partial
// failure doesn't leave settings half-updated.
router.put('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const settings = req.body as Array<{ cle: string; valeur: string }>;
  if (!Array.isArray(settings)) { res.status(400).json({ error: 'Array de {cle, valeur} requis' }); return; }

  // Validate theme value in the bulk path too.
  const themeEntry = settings.find(s => s.cle === 'theme');
  if (themeEntry && !VALID_THEMES.includes(themeEntry.valeur as typeof VALID_THEMES[number])) {
    res.status(400).json({ error: `Thème invalide. Valeurs autorisées: ${VALID_THEMES.join(', ')}` });
    return;
  }

  await prisma.$transaction(
    settings.map(({ cle, valeur }) =>
      prisma.setting.upsert({
        where: { cle },
        create: { cle, valeur },
        update: { valeur, updatedAt: new Date() },
      }),
    ),
  );

  invalidateCache();
  if (settings.some(s => s.cle === 'session_timeout_minutes')) invalidateSessionTimeoutCache();
  res.json({ message: `${settings.length} paramètres mis à jour` });
}));

export default router;
