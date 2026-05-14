import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Predefined content packages
const PACKAGES: Record<string, { nom: string; description: string; concepts: Array<{ code: string; nom: string; datatype: string; classe: string; unite?: string; valeur_min?: number; valeur_max?: number }>; encounter_types: string[]; formulaire?: { nom: string; fields: any[] } }> = {
  vih: {
    nom: 'VIH / SIDA',
    description: 'Pack de concepts, formulaires et workflows pour le suivi des patients VIH',
    concepts: [
      { code: 'CD4', nom: 'Numération CD4', datatype: 'numeric', classe: 'test', unite: 'cellules/mm³', valeur_min: 0, valeur_max: 2000 },
      { code: 'CHARGE_VIRALE', nom: 'Charge virale', datatype: 'numeric', classe: 'test', unite: 'copies/mL', valeur_min: 0, valeur_max: 10000000 },
      { code: 'STADE_OMS', nom: 'Stade OMS', datatype: 'coded', classe: 'finding' },
      { code: 'ARV_REGIME', nom: 'Régime ARV', datatype: 'text', classe: 'medicament' },
      { code: 'OBSERVANCE', nom: 'Observance traitement', datatype: 'coded', classe: 'finding' },
      { code: 'IO', nom: 'Infection opportuniste', datatype: 'text', classe: 'diagnostic' },
      { code: 'PROPHYLAXIE_CTX', nom: 'Prophylaxie CTX', datatype: 'boolean', classe: 'medicament' },
      { code: 'TB_SCREENING', nom: 'Dépistage tuberculose', datatype: 'coded', classe: 'test' },
    ],
    encounter_types: ['Consultation VIH', 'Dispensation ARV', 'Bilan biologique VIH', 'Counseling'],
  },
  maternite: {
    nom: 'Maternité',
    description: 'Pack pour le suivi de grossesse, accouchement et post-partum',
    concepts: [
      { code: 'DDR', nom: 'Date des dernières règles', datatype: 'date', classe: 'finding' },
      { code: 'DPA', nom: 'Date prévue d\'accouchement', datatype: 'date', classe: 'finding' },
      { code: 'GRAVITE_PARA', nom: 'Gravité/Parité', datatype: 'text', classe: 'finding' },
      { code: 'HU', nom: 'Hauteur utérine', datatype: 'numeric', classe: 'finding', unite: 'cm', valeur_min: 0, valeur_max: 45 },
      { code: 'BCF', nom: 'Bruits cardiaques fœtaux', datatype: 'numeric', classe: 'finding', unite: 'bpm', valeur_min: 100, valeur_max: 180 },
      { code: 'PRESENTATION', nom: 'Présentation fœtale', datatype: 'coded', classe: 'finding' },
      { code: 'DILATATION', nom: 'Dilatation col', datatype: 'numeric', classe: 'finding', unite: 'cm', valeur_min: 0, valeur_max: 10 },
      { code: 'APGAR_1', nom: 'Score APGAR 1min', datatype: 'numeric', classe: 'finding', valeur_min: 0, valeur_max: 10 },
      { code: 'APGAR_5', nom: 'Score APGAR 5min', datatype: 'numeric', classe: 'finding', valeur_min: 0, valeur_max: 10 },
      { code: 'POIDS_NAISSANCE', nom: 'Poids de naissance', datatype: 'numeric', classe: 'finding', unite: 'g', valeur_min: 500, valeur_max: 6000 },
    ],
    encounter_types: ['Consultation prénatale', 'Accouchement', 'Post-partum', 'Échographie obstétricale'],
  },
  diabete: {
    nom: 'Diabète',
    description: 'Pack pour le suivi des patients diabétiques',
    concepts: [
      { code: 'HBA1C', nom: 'Hémoglobine glyquée (HbA1c)', datatype: 'numeric', classe: 'test', unite: '%', valeur_min: 3, valeur_max: 20 },
      { code: 'GLYC_JEUN', nom: 'Glycémie à jeun', datatype: 'numeric', classe: 'test', unite: 'g/L', valeur_min: 0.3, valeur_max: 5 },
      { code: 'GLYC_PP', nom: 'Glycémie post-prandiale', datatype: 'numeric', classe: 'test', unite: 'g/L', valeur_min: 0.5, valeur_max: 6 },
      { code: 'TYPE_DIABETE', nom: 'Type de diabète', datatype: 'coded', classe: 'diagnostic' },
      { code: 'INSULINE', nom: 'Insulinothérapie', datatype: 'boolean', classe: 'medicament' },
      { code: 'FOND_OEIL', nom: 'Fond d\'œil', datatype: 'coded', classe: 'test' },
      { code: 'PIED_DIABETIQUE', nom: 'Examen pied diabétique', datatype: 'coded', classe: 'finding' },
      { code: 'CREATININE', nom: 'Créatinine', datatype: 'numeric', classe: 'test', unite: 'mg/L', valeur_min: 5, valeur_max: 50 },
    ],
    encounter_types: ['Consultation diabète', 'Bilan annuel diabète', 'Éducation thérapeutique'],
  },
  pediatrie: {
    nom: 'Pédiatrie',
    description: 'Pack pour le suivi pédiatrique et la vaccination',
    concepts: [
      { code: 'PERIMETRE_CRANIEN', nom: 'Périmètre crânien', datatype: 'numeric', classe: 'finding', unite: 'cm', valeur_min: 25, valeur_max: 60 },
      { code: 'PERIMETRE_BRACHIAL', nom: 'Périmètre brachial (PB)', datatype: 'numeric', classe: 'finding', unite: 'mm', valeur_min: 80, valeur_max: 200 },
      { code: 'Z_SCORE_PT', nom: 'Z-score Poids/Taille', datatype: 'numeric', classe: 'finding', valeur_min: -5, valeur_max: 5 },
      { code: 'ALLAITEMENT', nom: 'Mode d\'allaitement', datatype: 'coded', classe: 'finding' },
      { code: 'DEVELOPPEMENT', nom: 'Développement psychomoteur', datatype: 'coded', classe: 'finding' },
      { code: 'VACCINATION_STATUS', nom: 'Statut vaccinal', datatype: 'coded', classe: 'finding' },
    ],
    encounter_types: ['Consultation pédiatrique', 'Vaccination', 'Suivi nutritionnel', 'Bilan de développement'],
  },
};

// List available packages
router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const packages = Object.entries(PACKAGES).map(([id, pkg]) => ({
      id, nom: pkg.nom, description: pkg.description,
      nb_concepts: pkg.concepts.length,
      nb_encounter_types: pkg.encounter_types.length,
    }));
    res.json(packages);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get package details
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const pkg = PACKAGES[req.params.id];
  if (!pkg) { res.status(404).json({ error: 'Package non trouvé' }); return; }
  res.json({ id: req.params.id, ...pkg });
});

// Install package
router.post('/:id/install', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pkg = PACKAGES[req.params.id];
    if (!pkg) { res.status(404).json({ error: 'Package non trouvé' }); return; }

    let conceptsAdded = 0;
    let typesAdded = 0;

    // Install concepts — ON CONFLICT DO NOTHING via raw SQL (code is unique)
    for (const c of pkg.concepts) {
      try {
        await prisma.$executeRaw`
          INSERT INTO concepts (code, nom, datatype, classe, unite, valeur_min, valeur_max)
          VALUES (${c.code}::varchar, ${c.nom}::varchar, ${c.datatype}::concept_datatype, ${c.classe}::concept_classe, ${c.unite || null}, ${c.valeur_min ?? null}::decimal, ${c.valeur_max ?? null}::decimal)
          ON CONFLICT (code) DO NOTHING
        `;
        conceptsAdded++;
      } catch { /* skip duplicates */ }
    }

    // Install encounter types — skip duplicates
    for (const et of pkg.encounter_types) {
      try {
        const existing = await prisma.encounterType.findFirst({ where: { nom: et }, select: { id: true } });
        if (!existing) {
          await prisma.encounterType.create({ data: { nom: et } });
          typesAdded++;
        }
      } catch { /* skip */ }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'install_package',
        tableName: 'content_packages',
        details: `Installed ${pkg.nom}: ${conceptsAdded} concepts, ${typesAdded} encounter types`,
      },
    });

    res.json({ message: `Package "${pkg.nom}" installé`, conceptsAdded, typesAdded });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
