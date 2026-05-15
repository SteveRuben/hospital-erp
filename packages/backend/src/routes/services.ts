import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

// Get all services (hierarchical — parents with children)
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { flat, actif } = req.query;

  if (flat === 'true') {
    // Flat list (for dropdowns)
    const where: any = {};
    if (actif !== 'false') where.actif = true;
    const services = await prisma.service.findMany({ where, orderBy: [{ poids: 'desc' }, { nom: 'asc' }] });
    res.json(services);
    return;
  }

  // Hierarchical: return parents with nested children
  const all = actif !== 'false'
    ? await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT s.*, p.nom as parent_nom,
               (SELECT COUNT(*) FROM services sub WHERE sub.parent_id = s.id) as nb_sous_services
        FROM services s
        LEFT JOIN services p ON s.parent_id = p.id
        WHERE s.actif = TRUE
        ORDER BY s.poids DESC, s.nom ASC
      `
    : await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT s.*, p.nom as parent_nom,
               (SELECT COUNT(*) FROM services sub WHERE sub.parent_id = s.id) as nb_sous_services
        FROM services s
        LEFT JOIN services p ON s.parent_id = p.id
        ORDER BY s.poids DESC, s.nom ASC
      `;
  res.json(all);
}));

// Get service tree (parents + their children grouped)
router.get('/tree', authenticate, asyncHandler(async (_req, res) => {
  const parents = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT s.*,
           (SELECT COUNT(*) FROM services sub WHERE sub.parent_id = s.id AND sub.actif = TRUE)::int as nb_sous_services,
           (SELECT COALESCE(SUM(sub.prix), 0) FROM services sub WHERE sub.parent_id = s.id AND sub.actif = TRUE) as total_prix_sous
    FROM services s
    WHERE s.parent_id IS NULL AND s.actif = TRUE
    ORDER BY s.poids DESC, s.nom ASC
  `;

  const children = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM services WHERE parent_id IS NOT NULL AND actif = TRUE ORDER BY poids DESC, nom ASC
  `;

  const tree = (parents as any[]).map(p => ({
    ...p,
    sous_services: (children as any[]).filter(c => c.parent_id === p.id),
  }));

  res.json(tree);
}));

// Get single service with stats + children
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) { res.status(404).json({ error: 'Service non trouvé' }); return; }

  const [stats] = await prisma.$queryRaw<Array<{ nb_consultations: bigint; nb_patients: bigint; recettes: string | number }>>`
    SELECT COUNT(DISTINCT c.id)::bigint as nb_consultations,
           COUNT(DISTINCT c.patient_id)::bigint as nb_patients,
           COALESCE(SUM(r.montant), 0) as recettes
    FROM consultations c
    LEFT JOIN recettes r ON r.service_id = c.service_id
    WHERE c.service_id = ${id}
  `;

  const sousServices = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM services WHERE parent_id = ${id} ORDER BY poids DESC, nom ASC
  `;

  res.json({
    ...service,
    sous_services: sousServices,
    stats: {
      nb_consultations: Number(stats?.nb_consultations ?? 0),
      nb_patients: Number(stats?.nb_patients ?? 0),
      recettes: Number(stats?.recettes ?? 0),
    },
  });
}));

// Create service (with optional parent, prix, poids)
router.post('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { nom, description, parent_id, prix, poids, code } = req.body;
  if (!nom) { res.status(400).json({ error: 'Nom requis' }); return; }

  const created = await prisma.service.create({
    data: {
      nom,
      description: description || null,
      parentId: parent_id ? Number(parent_id) : null,
      prix: prix ? Number(prix) : 0,
      poids: poids ? Number(poids) : 0,
      code: code || null,
    },
  });
  res.status(201).json(created);
}));

// Update service
router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { nom, description, parent_id, prix, poids, code, actif } = req.body;

  // Build update data
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Service non trouvé' }); return; }

  const data: any = {};
  if (nom !== undefined) data.nom = nom;
  if (description !== undefined) data.description = description || null;
  if (parent_id !== undefined) data.parentId = parent_id ? Number(parent_id) : null;
  if (prix !== undefined) data.prix = Number(prix) || 0;
  if (poids !== undefined) data.poids = Number(poids) || 0;
  if (code !== undefined) data.code = code || null;
  if (actif !== undefined) data.actif = Boolean(actif);

  const updated = await prisma.service.update({ where: { id }, data });
  res.json(updated);
}));

// Toggle active
router.patch('/:id/toggle', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Service non trouvé' }); return; }
  const updated = await prisma.service.update({ where: { id }, data: { actif: !existing.actif } });
  res.json(updated);
}));

// Delete service
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  // Move children to no parent before deleting
  await prisma.$executeRaw`UPDATE services SET parent_id = NULL WHERE parent_id = ${id}`;
  try {
    await prisma.service.delete({ where: { id } });
    res.json({ message: 'Service supprimé' });
  } catch {
    res.status(404).json({ error: 'Service non trouvé ou utilisé par des consultations' });
  }
}));

export default router;
