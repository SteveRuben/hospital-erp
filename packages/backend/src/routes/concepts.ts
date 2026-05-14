import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createConceptSchema } from '../middleware/validation.js';

const router = Router();

// Get all concepts (with optional search/filter)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, classe, datatype, actif = 'true' } = req.query;
    const where: Prisma.ConceptWhereInput = { actif: actif === 'true' };
    if (search) {
      where.OR = [
        { nom: { contains: String(search), mode: 'insensitive' } },
        { code: { contains: String(search), mode: 'insensitive' } },
      ];
    }
    if (classe) where.classe = classe as Prisma.ConceptWhereInput['classe'];
    if (datatype) where.datatype = datatype as Prisma.ConceptWhereInput['datatype'];
    const rows = await prisma.concept.findMany({ where, orderBy: [{ classe: 'asc' }, { nom: 'asc' }] });
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get single concept with names, answers, mappings
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const conceptId = Number(req.params.id);
    const concept = await prisma.concept.findUnique({ where: { id: conceptId } });
    if (!concept) { res.status(404).json({ error: 'Concept non trouvé' }); return; }
    const noms = await prisma.conceptNom.findMany({ where: { conceptId }, orderBy: { langue: 'asc' } });
    const reponses = await prisma.$queryRaw<any[]>`
      SELECT cr.*, c.nom AS reponse_nom, c.code AS reponse_code
      FROM concept_reponses cr
      LEFT JOIN concepts c ON cr.reponse_concept_id = c.id
      WHERE cr.concept_id = ${conceptId}
      ORDER BY cr.ordre
    `;
    const mappings = await prisma.conceptMapping.findMany({ where: { conceptId } });
    res.json({ ...concept, noms, reponses, mappings });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create concept
router.post('/', authenticate, authorize('admin'), validate(createConceptSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, datatype, classe, description, unite, valeur_min, valeur_max } = req.body;
    if (!nom || !datatype || !classe) { res.status(400).json({ error: 'Nom, datatype et classe requis' }); return; }
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.concept.create({
      data: {
        nom,
        code: n(code) as string | null,
        datatype,
        classe,
        description: n(description) as string | null,
        unite: n(unite) as string | null,
        valeurMin: n(valeur_min) as any,
        valeurMax: n(valeur_max) as any,
      },
    });
    res.status(201).json(created);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message?.includes('unique') || err.message?.includes('Unique') ? 'Code déjà existant' : 'Erreur serveur' });
  }
});

// Update concept
router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, datatype, classe, description, unite, valeur_min, valeur_max, actif } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    try {
      const updated = await prisma.concept.update({
        where: { id: Number(req.params.id) },
        data: {
          nom,
          code: n(code) as string | null,
          datatype,
          classe,
          description: n(description) as string | null,
          unite: n(unite) as string | null,
          valeurMin: n(valeur_min) as any,
          valeurMax: n(valeur_max) as any,
          actif: actif !== false,
        },
      });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Add concept mapping
router.post('/:id/mappings', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { source, code_externe } = req.body;
    const created = await prisma.conceptMapping.create({
      data: { conceptId: Number(req.params.id), source, codeExterne: code_externe },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Add concept answer
router.post('/:id/reponses', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reponse_concept_id, ordre } = req.body;
    const created = await prisma.conceptReponse.create({
      data: { conceptId: Number(req.params.id), reponseConceptId: reponse_concept_id, ordre: ordre || 0 },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
