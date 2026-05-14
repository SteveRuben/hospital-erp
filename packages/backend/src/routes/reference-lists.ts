import { Router, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Get all categories
router.get('/categories', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const grouped = await prisma.referenceList.groupBy({
      by: ['categorie'],
      _count: { _all: true },
      orderBy: { categorie: 'asc' },
    });
    res.json(grouped.map(g => ({ categorie: g.categorie, total: g._count._all })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get items by category (only active by default)
router.get('/:categorie', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { all, parent } = req.query;
    const where: Prisma.ReferenceListWhereInput = { categorie: req.params.categorie };
    if (!all) where.actif = true;
    if (parent) where.parentCode = String(parent);
    const rows = await prisma.referenceList.findMany({
      where,
      orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create a new item
router.post('/:categorie', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, libelle, parent_code, ordre, par_defaut, metadata } = req.body;
    if (!code || !libelle) { res.status(400).json({ error: 'Code et libellé requis' }); return; }

    // If par_defaut, unset others in same category
    if (par_defaut) {
      await prisma.referenceList.updateMany({
        where: { categorie: req.params.categorie },
        data: { parDefaut: false },
      });
    }

    const created = await prisma.referenceList.create({
      data: {
        categorie: req.params.categorie,
        code: String(code).toUpperCase(),
        libelle,
        parentCode: parent_code || null,
        ordre: ordre || 0,
        parDefaut: par_defaut || false,
        metadata: metadata ?? Prisma.DbNull,
      },
    });
    res.status(201).json(created);
  } catch (err: any) {
    if (err.message?.includes('unique') || err.message?.includes('Unique')) { res.status(400).json({ error: 'Ce code existe déjà dans cette catégorie' }); return; }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update an item
router.put('/:categorie/:code', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { libelle, actif, par_defaut, ordre, parent_code, metadata } = req.body;
    const categorie = req.params.categorie;
    const code = req.params.code;

    // If setting as default, unset others
    if (par_defaut) {
      await prisma.referenceList.updateMany({
        where: { categorie },
        data: { parDefaut: false },
      });
    }

    const data: Prisma.ReferenceListUpdateInput = {};
    if (libelle !== undefined && libelle !== null) data.libelle = libelle;
    if (actif !== undefined && actif !== null) data.actif = actif;
    if (par_defaut !== undefined && par_defaut !== null) data.parDefaut = par_defaut;
    if (ordre !== undefined && ordre !== null) data.ordre = ordre;
    data.parentCode = parent_code || null;
    if (metadata !== undefined && metadata !== null) data.metadata = metadata;

    let updated;
    try {
      updated = await prisma.referenceList.update({
        where: { categorie_code: { categorie, code } },
        data,
      });
    } catch {
      res.status(404).json({ error: 'Élément non trouvé' });
      return;
    }

    // If only one item left active, set it as default
    const activeCount = await prisma.referenceList.count({ where: { categorie, actif: true } });
    if (activeCount === 1) {
      await prisma.referenceList.updateMany({
        where: { categorie, actif: true },
        data: { parDefaut: true },
      });
    }

    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Toggle active/inactive
router.patch('/:categorie/:code/toggle', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const categorie = req.params.categorie;
    const code = req.params.code;
    const current = await prisma.referenceList.findUnique({
      where: { categorie_code: { categorie, code } },
      select: { actif: true },
    });
    if (!current) { res.status(404).json({ error: 'Élément non trouvé' }); return; }
    const updated = await prisma.referenceList.update({
      where: { categorie_code: { categorie, code } },
      data: { actif: !current.actif },
    });

    // If only one item left active, set it as default
    const activeCount = await prisma.referenceList.count({ where: { categorie, actif: true } });
    if (activeCount === 1) {
      await prisma.referenceList.updateMany({
        where: { categorie, actif: true },
        data: { parDefaut: true },
      });
    }

    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Delete an item
router.delete('/:categorie/:code', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    try {
      await prisma.referenceList.delete({
        where: { categorie_code: { categorie: req.params.categorie, code: req.params.code } },
      });
      res.json({ message: 'Supprimé' });
    } catch {
      res.status(404).json({ error: 'Élément non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Import CSV for a category
// CSV format: code;libelle;parent_code(optional);ordre(optional)
router.post('/:categorie/import', authenticate, authorize('admin'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Fichier CSV requis' }); return; }

    const content = req.file.buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const categorie = req.params.categorie;

    // Skip header if it looks like one
    const startIdx = lines[0].toLowerCase().includes('code') ? 1 : 0;

    let imported = 0;
    let errors: string[] = [];

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(/[;,\t]/).map(s => s.trim().replace(/^"|"$/g, ''));
      if (parts.length < 2) { errors.push(`Ligne ${i + 1}: format invalide (min: code;libelle)`); continue; }

      const [code, libelle, parent_code, ordreStr] = parts;
      if (!code || !libelle) { errors.push(`Ligne ${i + 1}: code et libellé requis`); continue; }

      try {
        const upperCode = code.toUpperCase();
        const ordre = parseInt(ordreStr) || 0;
        await prisma.referenceList.upsert({
          where: { categorie_code: { categorie, code: upperCode } },
          create: { categorie, code: upperCode, libelle, parentCode: parent_code || null, ordre },
          update: { libelle, parentCode: parent_code || null, ordre },
        });
        imported++;
      } catch (err) {
        errors.push(`Ligne ${i + 1}: erreur d'insertion`);
      }
    }

    // If only one item imported and no others exist, set as default
    const total = await prisma.referenceList.count({ where: { categorie, actif: true } });
    if (total === 1) {
      await prisma.referenceList.updateMany({
        where: { categorie, actif: true },
        data: { parDefaut: true },
      });
    }

    res.json({ imported, errors: errors.length > 0 ? errors : undefined, total: imported });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Export category as CSV
router.get('/:categorie/export', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.referenceList.findMany({
      where: { categorie: req.params.categorie },
      select: { code: true, libelle: true, parentCode: true, ordre: true, actif: true, parDefaut: true },
      orderBy: [{ ordre: 'asc' }, { libelle: 'asc' }],
    });
    const csv = '﻿' + 'code;libelle;parent_code;ordre;actif;par_defaut\n' +
      rows.map(r => `${r.code};${r.libelle};${r.parentCode || ''};${r.ordre};${r.actif};${r.parDefaut}`).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${req.params.categorie}.csv`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
