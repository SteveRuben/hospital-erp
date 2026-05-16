import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { invalidateCache } from '../services/reference.js';

const router = Router();

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
router.put('/:cle', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { valeur } = req.body;
  if (valeur === undefined || valeur === null) { res.status(400).json({ error: 'Valeur requise' }); return; }

  const updated = await prisma.setting.upsert({
    where: { cle: req.params.cle },
    create: { cle: req.params.cle, valeur: String(valeur) },
    update: { valeur: String(valeur), updatedAt: new Date() },
  });

  invalidateCache();
  res.json(updated);
}));

// Bulk update settings (admin only) — single transaction so a partial
// failure doesn't leave settings half-updated.
router.put('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const settings = req.body as Array<{ cle: string; valeur: string }>;
  if (!Array.isArray(settings)) { res.status(400).json({ error: 'Array de {cle, valeur} requis' }); return; }

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
  res.json({ message: `${settings.length} paramètres mis à jour` });
}));

export default router;
