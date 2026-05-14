import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { invalidateCache } from '../services/reference.js';

const router = Router();

// Get all settings (admin only)
router.get('/', authenticate, authorize('admin'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.setting.findMany({ orderBy: [{ categorie: 'asc' }, { cle: 'asc' }] });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get settings by category
router.get('/categorie/:categorie', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.setting.findMany({
      where: { categorie: req.params.categorie },
      select: { cle: true, valeur: true },
    });
    const map: Record<string, string> = {};
    for (const row of rows) map[row.cle] = row.valeur;
    res.json(map);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get a single setting value (public for some keys)
router.get('/:cle', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const row = await prisma.setting.findUnique({
      where: { cle: req.params.cle },
      select: { valeur: true },
    });
    if (!row) { res.status(404).json({ error: 'Paramètre non trouvé' }); return; }
    res.json({ cle: req.params.cle, valeur: row.valeur });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Update a setting (admin only)
router.put('/:cle', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { valeur } = req.body;
    if (valeur === undefined || valeur === null) { res.status(400).json({ error: 'Valeur requise' }); return; }

    const updated = await prisma.setting.upsert({
      where: { cle: req.params.cle },
      create: { cle: req.params.cle, valeur: String(valeur) },
      update: { valeur: String(valeur), updatedAt: new Date() },
    });

    // Invalidate caches
    invalidateCache();

    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Bulk update settings (admin only)
router.put('/', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = req.body as Array<{ cle: string; valeur: string }>;
    if (!Array.isArray(settings)) { res.status(400).json({ error: 'Array de {cle, valeur} requis' }); return; }

    for (const { cle, valeur } of settings) {
      await prisma.setting.upsert({
        where: { cle },
        create: { cle, valeur },
        update: { valeur, updatedAt: new Date() },
      });
    }

    invalidateCache();
    res.json({ message: `${settings.length} paramètres mis à jour` });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
