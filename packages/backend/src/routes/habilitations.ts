import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// OWASP A05: admin-only — the full role/module access matrix is sensitive info
// that helps an attacker map the system. Non-admins use /me to get their own.
router.get('/', authenticate, authorize('admin'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.habilitation.findMany({ orderBy: [{ role: 'asc' }, { module: 'asc' }] });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get habilitations for current user's role
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.habilitation.findMany({
      where: { role: req.user!.role, acces: true },
      select: { module: true },
    });
    res.json(rows.map(r => r.module));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Update habilitation (admin only)
router.put('/', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, module, acces } = req.body;
    if (!role || !module) { res.status(400).json({ error: 'Rôle et module requis' }); return; }
    await prisma.habilitation.upsert({
      where: { role_module: { role, module } },
      create: { role, module, acces },
      update: { acces },
    });

    // Audit log
    console.log(`[AUDIT][HABILITATION] ${req.user!.username} changed ${role}/${module} to ${acces}`);
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'update_habilitation',
        tableName: 'habilitations',
        details: `${role}/${module} = ${acces}`,
      },
    });

    res.json({ message: 'Habilitation mise à jour' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Menu config is rendered by every authenticated user's layout, so it stays
// authenticate-only. The contents (label/path/icon) are not sensitive — the
// gating happens via habilitations + RoleGuard on the frontend.
router.get('/menu', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.menuConfig.findMany({
      where: { actif: true },
      orderBy: [{ groupeOrdre: 'asc' }, { ordre: 'asc' }],
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Update menu item order/group (admin only)
router.put('/menu/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { groupe, groupe_ordre, label, icon, ordre, actif } = req.body;
    try {
      const updated = await prisma.menuConfig.update({
        where: { id: Number(req.params.id) },
        data: { groupe, groupeOrdre: groupe_ordre, label, icon, ordre, actif },
      });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Bulk update menu order (admin only). Single transaction so a partial failure
// doesn't leave the menu in a half-reordered state.
router.put('/menu-order', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { items } = req.body as { items: Array<{ id: number; groupe: string; groupe_ordre: number; ordre: number }> };
    await prisma.$transaction(
      items.map(item =>
        prisma.menuConfig.update({
          where: { id: item.id },
          data: { groupe: item.groupe, groupeOrdre: item.groupe_ordre, ordre: item.ordre },
        }),
      ),
    );
    res.json({ message: 'Ordre mis à jour' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
