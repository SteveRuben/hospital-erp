import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createFacilitySchema } from '../middleware/validation.js';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.facility.findMany({ where: { actif: true }, orderBy: { nom: 'asc' } });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin'), validate(createFacilitySchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, type_facility, adresse, ville, telephone, email } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.facility.create({
      data: {
        nom,
        code: n(code) as string | null,
        typeFacility: n(type_facility) as string | null,
        adresse: n(adresse) as string | null,
        ville: n(ville) as string | null,
        telephone: n(telephone) as string | null,
        email: n(email) as string | null,
      },
    });
    res.status(201).json(created);
  } catch (err: any) { res.status(500).json({ error: err.message?.includes('unique') || err.message?.includes('Unique') ? 'Code déjà existant' : 'Erreur serveur' }); }
});

router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, type_facility, adresse, ville, telephone, email, actif } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    try {
      const updated = await prisma.facility.update({
        where: { id: Number(req.params.id) },
        data: {
          nom,
          code: n(code) as string | null,
          typeFacility: n(type_facility) as string | null,
          adresse: n(adresse) as string | null,
          ville: n(ville) as string | null,
          telephone: n(telephone) as string | null,
          email: n(email) as string | null,
          actif: actif !== false,
        },
      });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
