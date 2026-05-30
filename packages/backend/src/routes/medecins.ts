import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createMedecinSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

// Get doctors with multi-criteria search. All filters are optional and AND-ed
// together; `search` is a fuzzy term that ORs across nom / prenom / specialite
// so the user can type a single token and get reasonable results. Returns
// either the flat array (legacy callers that just want the dropdown) or a
// paginated envelope when ?page= is provided — keeps the existing dropdowns
// working without a frontend change.
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { search, specialite, telephone, page, limit } = req.query;
  const where: Prisma.MedecinWhereInput = {};
  const ands: Prisma.MedecinWhereInput[] = [];

  if (search) {
    const s = String(search);
    ands.push({
      OR: [
        { nom: { contains: s, mode: 'insensitive' } },
        { prenom: { contains: s, mode: 'insensitive' } },
        { specialite: { contains: s, mode: 'insensitive' } },
      ],
    });
  }
  if (specialite) ands.push({ specialite: { contains: String(specialite), mode: 'insensitive' } });
  if (telephone) ands.push({ telephone: { contains: String(telephone), mode: 'insensitive' } });
  if (ands.length) where.AND = ands;

  // Paginated envelope only when the client opts in via ?page=. Existing
  // callers (dropdowns, autocomplete) keep the flat array.
  if (page !== undefined) {
    const pg = Math.max(1, Number(page));
    const lim = Math.min(100, Math.max(1, Number(limit) || 20));
    const [total, data] = await Promise.all([
      prisma.medecin.count({ where }),
      prisma.medecin.findMany({ where, orderBy: [{ nom: 'asc' }, { prenom: 'asc' }], take: lim, skip: (pg - 1) * lim }),
    ]);
    res.json({ data, total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) });
    return;
  }

  const rows = await prisma.medecin.findMany({ where, orderBy: [{ nom: 'asc' }, { prenom: 'asc' }] });
  res.json(rows);
}));

// Lightweight list of distinct specialités for the search filter dropdown.
// Tiny payload, no auth role gate beyond `authenticate` since the list is
// already implicit in the public medecin list.
router.get('/specialites', authenticate, asyncHandler(async (_req, res) => {
  const rows = await prisma.medecin.findMany({
    where: { specialite: { not: null } },
    select: { specialite: true },
    distinct: ['specialite'],
    orderBy: { specialite: 'asc' },
  });
  res.json(rows.map(r => r.specialite).filter(Boolean));
}));

// Get single doctor
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const row = await prisma.medecin.findUnique({
    where: { id: Number(req.params.id) },
    include: { user: { select: { id: true, username: true, role: true, suspended: true } } },
  });
  if (!row) { res.status(404).json({ error: 'Médecin non trouvé' }); return; }
  res.json(row);
}));

// P0-6: list every Medecin row that has no linked User. Admin uses this
// to repair the after-effect of an automatic backfill (ambiguous name
// matches stay null, ditto for medecins whose user account didn't exist
// at backfill time).
router.get('/admin/unlinked', authenticate, authorize('admin'), asyncHandler(async (_req, res) => {
  const rows = await prisma.medecin.findMany({
    where: { userId: null },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    select: { id: true, nom: true, prenom: true, specialite: true, telephone: true },
  });
  res.json(rows);
}));

// Manually attach a Medecin to a User. Admin-only. Validates the User
// has role='medecin' so we don't mislink an admin or a comptable.
router.put('/:id/link-user', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const medecinId = Number(req.params.id);
  const { user_id } = req.body as { user_id?: number | string };
  if (user_id === undefined || user_id === null || user_id === '') {
    // Unlink — admin is explicitly detaching the medecin from a user.
    await prisma.medecin.update({ where: { id: medecinId }, data: { userId: null } });
    res.json({ message: 'Lien retiré' });
    return;
  }
  const userId = Number(user_id);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) { res.status(404).json({ error: 'Utilisateur non trouvé' }); return; }
  if (user.role !== 'medecin') {
    res.status(400).json({ error: 'L\'utilisateur doit avoir le rôle medecin' });
    return;
  }
  try {
    const updated = await prisma.medecin.update({ where: { id: medecinId }, data: { userId } });
    res.json(updated);
  } catch (err: any) {
    // Unique constraint — the user is already linked to another medecin.
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Cet utilisateur est déjà lié à un autre médecin' });
      return;
    }
    throw err;
  }
}));

// Create doctor
router.post('/', authenticate, authorize('admin'), validate(createMedecinSchema), asyncHandler(async (req, res) => {
  const { nom, prenom, specialite, telephone } = req.body;
  const created = await prisma.medecin.create({ data: { nom, prenom, specialite, telephone } });
  res.status(201).json(created);
}));

// Update doctor
router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { nom, prenom, specialite, telephone } = req.body;
  try {
    const updated = await prisma.medecin.update({
      where: { id: Number(req.params.id) },
      data: { nom, prenom, specialite, telephone },
    });
    res.json(updated);
  } catch {
    res.status(404).json({ error: 'Médecin non trouvé' });
  }
}));

// Delete doctor
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  try {
    await prisma.medecin.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Médecin supprimé' });
  } catch {
    res.status(404).json({ error: 'Médecin non trouvé' });
  }
}));

export default router;
