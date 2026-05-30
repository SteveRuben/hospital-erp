import { Router } from 'express';
import { Prisma } from '@prisma/client';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, createMedecinSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

// P0-6 Phase 2: there is no more `medecins` table — a medecin is now a
// User with role='medecin' (plus the specialite column moved onto User).
// This file remains because the frontend keeps using /api/medecins as
// the resource path; every operation here is a thin filter over the
// users table so external callers (dropdowns, forms, schedules) don't
// need to change wire shape.

const MEDECIN_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  specialite: true,
  telephone: true,
  createdAt: true,
} as const;

// Get doctors with multi-criteria search. All filters are optional and AND-ed
// together; `search` is a fuzzy term that ORs across nom / prenom / specialite
// so the user can type a single token and get reasonable results.
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { search, specialite, telephone, page, limit } = req.query;
  const ands: Prisma.UserWhereInput[] = [{ role: 'medecin' }];

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
  const where: Prisma.UserWhereInput = { AND: ands };

  if (page !== undefined) {
    const pg = Math.max(1, Number(page));
    const lim = Math.min(100, Math.max(1, Number(limit) || 20));
    const [total, data] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, select: MEDECIN_SELECT, orderBy: [{ nom: 'asc' }, { prenom: 'asc' }], take: lim, skip: (pg - 1) * lim }),
    ]);
    res.json({ data, total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) });
    return;
  }

  const rows = await prisma.user.findMany({ where, select: MEDECIN_SELECT, orderBy: [{ nom: 'asc' }, { prenom: 'asc' }] });
  res.json(rows);
}));

// Lightweight list of distinct specialités for the search filter dropdown.
router.get('/specialites', authenticate, asyncHandler(async (_req, res) => {
  const rows = await prisma.user.findMany({
    where: { role: 'medecin', specialite: { not: null } },
    select: { specialite: true },
    distinct: ['specialite'],
    orderBy: { specialite: 'asc' },
  });
  res.json(rows.map(r => r.specialite).filter(Boolean));
}));

// Get single doctor (by user id)
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const row = await prisma.user.findFirst({
    where: { id: Number(req.params.id), role: 'medecin' },
    select: {
      ...MEDECIN_SELECT,
      username: true,
      suspended: true,
    },
  });
  if (!row) { res.status(404).json({ error: 'Médecin non trouvé' }); return; }
  res.json(row);
}));

// Create doctor — provisions a User account with role='medecin'. The
// admin sets a temporary password (or lets the auto-generated one ride
// + must_change_password=true on first login).
router.post('/', authenticate, authorize('admin'), validate(createMedecinSchema), asyncHandler(async (req, res) => {
  const { nom, prenom, specialite, telephone, username, password } = req.body as {
    nom: string; prenom: string; specialite?: string; telephone?: string;
    username?: string; password?: string;
  };
  // Username default: derive from nom/prenom, suffix with a random
  // 4-char tag so two concurrent admin creates don't collide.
  const slugBase = `${prenom ?? ''}.${nom ?? ''}`
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  const finalUsername = (username && String(username).trim()) || `dr.${slugBase || 'medecin'}.${crypto.randomBytes(2).toString('hex')}`;
  const pwd = await argon2.hash(
    password && String(password).length >= 8 ? String(password) : (crypto.randomUUID() + crypto.randomUUID()),
    { type: argon2.argon2id },
  );
  try {
    const created = await prisma.user.create({
      data: {
        username: finalUsername,
        password: pwd,
        role: 'medecin',
        nom, prenom,
        specialite: specialite ?? null,
        telephone: telephone ?? null,
        must_change_password: true,
      },
      select: MEDECIN_SELECT,
    });
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Un utilisateur avec ce nom existe déjà' });
      return;
    }
    throw err;
  }
}));

// Update doctor profile
router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { nom, prenom, specialite, telephone } = req.body;
  try {
    const id = Number(req.params.id);
    // Guard: only update if the row is actually a medecin. Avoids
    // accidentally rewriting an admin/reception profile via this route.
    const existing = await prisma.user.findFirst({ where: { id, role: 'medecin' }, select: { id: true } });
    if (!existing) { res.status(404).json({ error: 'Médecin non trouvé' }); return; }
    const updated = await prisma.user.update({
      where: { id },
      data: { nom, prenom, specialite, telephone },
      select: MEDECIN_SELECT,
    });
    res.json(updated);
  } catch {
    res.status(404).json({ error: 'Médecin non trouvé' });
  }
}));

// Delete (= suspend) doctor. Hard-deleting a User would orphan every
// clinical FK; instead we flip suspended=TRUE so the account can't sign
// in but historical records stay attributable. Admin can reactivate via
// the Utilisateurs UI.
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.user.findFirst({ where: { id, role: 'medecin' }, select: { id: true } });
    if (!existing) { res.status(404).json({ error: 'Médecin non trouvé' }); return; }
    await prisma.user.update({ where: { id }, data: { suspended: true, suspendedAt: new Date() } });
    res.json({ message: 'Médecin suspendu' });
  } catch {
    res.status(404).json({ error: 'Médecin non trouvé' });
  }
}));

export default router;
