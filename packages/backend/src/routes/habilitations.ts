import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get all habilitations
router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM habilitations ORDER BY role, module');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get habilitations for current user's role
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT module, acces FROM habilitations WHERE role = $1 AND acces = TRUE', [req.user!.role]);
    res.json(result.rows.map((r: { module: string }) => r.module));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Update habilitation (admin only)
router.put('/', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, module, acces } = req.body;
    if (!role || !module) { res.status(400).json({ error: 'Rôle et module requis' }); return; }
    await query('INSERT INTO habilitations (role, module, acces) VALUES ($1,$2,$3) ON CONFLICT (role, module) DO UPDATE SET acces = $3', [role, module, acces]);
    
    // Audit log
    console.log(`[AUDIT][HABILITATION] ${req.user!.username} changed ${role}/${module} to ${acces}`);
    await query('INSERT INTO audit_log (user_id, action, table_name, details) VALUES ($1,$2,$3,$4)', [req.user!.id, 'update_habilitation', 'habilitations', `${role}/${module} = ${acces}`]);
    
    res.json({ message: 'Habilitation mise à jour' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get menu config
router.get('/menu', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM menu_config WHERE actif = TRUE ORDER BY groupe_ordre, ordre');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Update menu item order/group (admin only)
router.put('/menu/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { groupe, groupe_ordre, label, icon, ordre, actif } = req.body;
    const result = await query('UPDATE menu_config SET groupe=$1, groupe_ordre=$2, label=$3, icon=$4, ordre=$5, actif=$6 WHERE id=$7 RETURNING *', [groupe, groupe_ordre, label, icon, ordre, actif, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Bulk update menu order (admin only)
router.put('/menu-order', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { items } = req.body as { items: Array<{ id: number; groupe: string; groupe_ordre: number; ordre: number }> };
    for (const item of items) {
      await query('UPDATE menu_config SET groupe=$1, groupe_ordre=$2, ordre=$3 WHERE id=$4', [item.groupe, item.groupe_ordre, item.ordre, item.id]);
    }
    res.json({ message: 'Ordre mis à jour' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;