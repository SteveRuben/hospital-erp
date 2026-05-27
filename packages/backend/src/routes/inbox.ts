/**
 * In-app notification inbox for staff. Drives the bell-icon dropdown.
 * Routes are user-scoped — every query filters by `req.user.id` so an
 * authenticated user can only see and mutate their own notifications.
 */

import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

// List recent notifications, newest first. Capped at 50 — the bell dropdown
// only ever shows the latest few, full history is a separate page if needed.
router.get('/', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const rows = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json(rows);
}));

// Bell badge — unread count only. Hot path, kept minimal.
router.get('/unread-count', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, read: false },
  });
  res.json({ count });
}));

// Mark a single notification as read. Idempotent.
router.patch('/:id/read', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  // updateMany with userId guard so a user can't flip someone else's notif.
  const result = await prisma.notification.updateMany({
    where: { id, userId: req.user!.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  res.json({ updated: result.count });
}));

// Mark everything as read — used by the "tout marquer comme lu" action.
router.patch('/read-all', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  res.json({ updated: result.count });
}));

// Delete a notification (used by "dismiss" gesture on the dropdown row).
router.delete('/:id', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await prisma.notification.deleteMany({
    where: { id, userId: req.user!.id },
  });
  res.json({ ok: true });
}));

export default router;
