import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createMedicamentSchema, createStockSchema } from '../middleware/validation.js';

const router = Router();

// === MEDICAMENTS ===
router.get('/medicaments', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, categorie } = req.query;
    const where: Prisma.MedicamentWhereInput = { actif: true };
    if (search) {
      const s = String(search);
      where.OR = [
        { nom: { contains: s, mode: 'insensitive' } },
        { dci: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (categorie) where.categorie = String(categorie);
    const rows = await prisma.medicament.findMany({ where, orderBy: { nom: 'asc' } });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/medicaments', authenticate, authorize('admin'), validate(createMedicamentSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, dci, forme, dosage_standard, code_barre, categorie, prix_unitaire } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.medicament.create({
      data: {
        nom,
        dci: n(dci) as string | null,
        forme: n(forme) as string | null,
        dosageStandard: n(dosage_standard) as string | null,
        codeBarre: n(code_barre) as string | null,
        categorie: n(categorie) as string | null,
        prixUnitaire: n(prix_unitaire) as number | null,
      },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === STOCK ===
router.get('/stock', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.stock.findMany({ orderBy: [{ dateExpiration: 'asc' }] });
    const medIds = Array.from(new Set(rows.map(s => s.medicamentId).filter((v): v is number => v != null)));
    const meds = medIds.length > 0
      ? await prisma.medicament.findMany({ where: { id: { in: medIds } }, select: { id: true, nom: true, forme: true, dci: true } })
      : [];
    const medMap = new Map(meds.map(m => [m.id, m]));
    // Sort by medicament nom then date_expiration (replicating SQL "ORDER BY m.nom, s.date_expiration")
    const mapped = rows.map(s => ({
      ...s,
      medicament_nom: s.medicamentId != null ? (medMap.get(s.medicamentId)?.nom ?? null) : null,
      forme: s.medicamentId != null ? (medMap.get(s.medicamentId)?.forme ?? null) : null,
      dci: s.medicamentId != null ? (medMap.get(s.medicamentId)?.dci ?? null) : null,
    }));
    mapped.sort((a, b) => {
      const an = a.medicament_nom ?? '';
      const bn = b.medicament_nom ?? '';
      if (an !== bn) return an.localeCompare(bn);
      const ad = a.dateExpiration ? new Date(a.dateExpiration).getTime() : Infinity;
      const bd = b.dateExpiration ? new Date(b.dateExpiration).getTime() : Infinity;
      return ad - bd;
    });
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/stock', authenticate, authorize('admin'), validate(createStockSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicament_id, lot, date_expiration, quantite, quantite_min, prix_achat, fournisseur } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const data: Parameters<typeof prisma.stock.create>[0]['data'] = {
      medicamentId: medicament_id ?? null,
      lot: n(lot) as string | null,
      quantite: quantite || 0,
      quantiteMin: quantite_min || 10,
      prixAchat: n(prix_achat) as number | null,
      fournisseur: n(fournisseur) as string | null,
    };
    if (date_expiration) data.dateExpiration = new Date(date_expiration);
    const created = await prisma.stock.create({ data });
    // Log mouvement entree
    await prisma.stockMouvement.create({
      data: {
        medicamentId: medicament_id ?? null,
        typeMouvement: 'entree',
        quantite: quantite || 0,
        lot: n(lot) as string | null,
        motif: 'Entrée stock initiale',
        userId: req.user!.id,
      },
    });
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// === MOUVEMENTS ===
router.get('/mouvements', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.stockMouvement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    const medIds = Array.from(new Set(rows.map(s => s.medicamentId).filter((v): v is number => v != null)));
    const userIds = Array.from(new Set(rows.map(s => s.userId).filter((v): v is number => v != null)));
    const [meds, users] = await Promise.all([
      medIds.length > 0 ? prisma.medicament.findMany({ where: { id: { in: medIds } }, select: { id: true, nom: true } }) : Promise.resolve([]),
      userIds.length > 0 ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nom: true, prenom: true } }) : Promise.resolve([]),
    ]);
    const medMap = new Map(meds.map(m => [m.id, m]));
    const userMap = new Map(users.map(u => [u.id, u]));
    const mapped = rows.map(s => ({
      ...s,
      medicament_nom: s.medicamentId != null ? (medMap.get(s.medicamentId)?.nom ?? null) : null,
      user_nom: s.userId != null ? (userMap.get(s.userId)?.nom ?? null) : null,
      user_prenom: s.userId != null ? (userMap.get(s.userId)?.prenom ?? null) : null,
    }));
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/mouvements', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicament_id, type_mouvement, quantite, lot, motif } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    await prisma.stockMouvement.create({
      data: {
        medicamentId: medicament_id ?? null,
        typeMouvement: type_mouvement,
        quantite,
        lot: n(lot) as string | null,
        motif: n(motif) as string | null,
        userId: req.user!.id,
      },
    });
    // Update stock quantity (matching the SQL: lot = $3 OR $3 IS NULL → match any lot when lot is null)
    const lotVal = n(lot) as string | null;
    if (type_mouvement === 'entree') {
      await prisma.$executeRaw`UPDATE stock SET quantite = quantite + ${quantite} WHERE medicament_id = ${medicament_id} AND (lot = ${lotVal} OR ${lotVal}::text IS NULL)`;
    } else if (type_mouvement === 'sortie') {
      await prisma.$executeRaw`UPDATE stock SET quantite = quantite - ${quantite} WHERE medicament_id = ${medicament_id} AND (lot = ${lotVal} OR ${lotVal}::text IS NULL)`;
    }
    res.json({ message: 'Mouvement enregistré' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === DISPENSATIONS ===
router.post('/dispensations', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, prescription_id, medicament_id, quantite_delivree, notes } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.dispensation.create({
      data: {
        patientId: patient_id ?? null,
        prescriptionId: n(prescription_id) as number | null,
        medicamentId: medicament_id ?? null,
        quantiteDelivree: quantite_delivree ?? null,
        dispenseurId: req.user!.id,
        notes: n(notes) as string | null,
      },
    });
    // Decrease stock — keep raw SQL for the LIMIT 1 + conditional decrement
    await prisma.$executeRaw`UPDATE stock SET quantite = quantite - ${quantite_delivree} WHERE id = (SELECT id FROM stock WHERE medicament_id = ${medicament_id} AND quantite >= ${quantite_delivree} LIMIT 1)`;
    await prisma.stockMouvement.create({
      data: {
        medicamentId: medicament_id ?? null,
        typeMouvement: 'sortie',
        quantite: quantite_delivree,
        motif: `Dispensation patient #${patient_id}`,
        userId: req.user!.id,
      },
    });
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// === ALERTES ===
router.get('/alertes', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const allStock = await prisma.stock.findMany();
    const medIds = Array.from(new Set(allStock.map(s => s.medicamentId).filter((v): v is number => v != null)));
    const meds = medIds.length > 0
      ? await prisma.medicament.findMany({ where: { id: { in: medIds } }, select: { id: true, nom: true } })
      : [];
    const medMap = new Map(meds.map(m => [m.id, m.nom]));

    const withName = (s: typeof allStock[number]) => ({
      ...s,
      medicament_nom: s.medicamentId != null ? (medMap.get(s.medicamentId) ?? null) : null,
    });

    // quantite <= quantite_min AND quantite > 0
    const stockBas = allStock.filter(s => s.quantite <= s.quantiteMin && s.quantite > 0).map(withName);
    const rupture = allStock.filter(s => s.quantite === 0).map(withName);
    const perimes = allStock.filter(s => s.dateExpiration && s.dateExpiration < now).map(withName);
    const bientotPerimes = allStock.filter(s => s.dateExpiration && s.dateExpiration >= now && s.dateExpiration <= in30Days).map(withName);

    res.json({ stockBas, rupture, perimes, bientotPerimes });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
