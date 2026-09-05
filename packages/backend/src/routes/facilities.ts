import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createFacilitySchema } from '../middleware/validation.js';

const router = Router();

// GET /api/facilities — list all facilities (super_admin sees all, admin sees own)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const where = user.role === 'super_admin' ? {} : { actif: true };
    const rows = await prisma.facility.findMany({
      where,
      include: { children: { select: { id: true, nom: true, typeFacility: true } } },
      orderBy: { nom: 'asc' },
    });
    // Build tree: top-level facilities with their branches
    const topLevel = rows.filter(r => r.parentId === null);
    const result = topLevel.map(f => ({
      ...f,
      branches: rows.filter(r => r.parentId === f.id),
    }));
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/facilities/all — flat list for dropdowns
router.get('/all', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.facility.findMany({ where: { actif: true }, orderBy: { nom: 'asc' } });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/facilities/:id — detail with branches
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.facility.findUnique({
      where: { id },
      include: {
        children: { orderBy: { nom: 'asc' } },
        parent: { select: { id: true, nom: true } },
        _count: { select: { users: true, patients: true, services: true } },
      },
    });
    if (!row) { res.status(404).json({ error: 'Établissement non trouvé' }); return; }
    res.json(row);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/facilities — create facility (super_admin only)
router.post('/', authenticate, authorize('super_admin'), validate(createFacilitySchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, type_facility, parent_id, adresse, ville, telephone, email } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.facility.create({
      data: {
        nom,
        code: n(code) as string | null,
        typeFacility: n(type_facility) as string | null,
        parentId: parent_id ? Number(parent_id) : null,
        adresse: n(adresse) as string | null,
        ville: n(ville) as string | null,
        telephone: n(telephone) as string | null,
        email: n(email) as string | null,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Ce code existe déjà' }); return;
    }
    console.error(err); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/facilities/:id — update facility (super_admin only)
router.put('/:id', authenticate, authorize('super_admin'), validate(createFacilitySchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.facility.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Établissement non trouvé' }); return; }
    const { nom, code, type_facility, parent_id, adresse, ville, telephone, email } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    // Prevent self-referencing parent
    if (parent_id && Number(parent_id) === id) {
      res.status(400).json({ error: 'Un établissement ne peut pas être son propre parent' }); return;
    }
    const updated = await prisma.facility.update({
      where: { id },
      data: {
        nom,
        code: n(code) as string | null,
        typeFacility: n(type_facility) as string | null,
        parentId: parent_id ? Number(parent_id) : null,
        adresse: n(adresse) as string | null,
        ville: n(ville) as string | null,
        telephone: n(telephone) as string | null,
        email: n(email) as string | null,
      },
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Ce code existe déjà' }); return;
    }
    console.error(err); res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/facilities/:id — soft-delete (super_admin only)
router.delete('/:id', authenticate, authorize('super_admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.facility.findUnique({ where: { id }, include: { _count: { select: { users: true, patients: true } } } });
    if (!existing) { res.status(404).json({ error: 'Établissement non trouvé' }); return; }
    if (existing._count.users > 0 || existing._count.patients > 0) {
      res.status(400).json({ error: `Impossible de supprimer : ${existing._count.users} utilisateurs et ${existing._count.patients} patients y sont rattachés` }); return;
    }
    await prisma.facility.update({ where: { id }, data: { actif: false } });
    res.json({ message: 'Établissement désactivé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
