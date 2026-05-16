import { Router, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createMedicamentSchema, createStockSchema } from '../middleware/validation.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

// Stock alerts — items below minimum threshold
router.get('/alerts/stock-bas', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT s.id, s.quantite, s.quantite_min, s.lot, s.date_expiration,
             m.nom as medicament_nom, m.forme, m.dci
      FROM stock s
      JOIN medicaments m ON s.medicament_id = m.id
      WHERE s.quantite <= s.quantite_min AND m.actif = TRUE
      ORDER BY (s.quantite::float / NULLIF(s.quantite_min, 0)) ASC
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Expired or soon-to-expire stock (within 30 days)
router.get('/alerts/expirations', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT s.id, s.quantite, s.lot, s.date_expiration,
             m.nom as medicament_nom, m.forme
      FROM stock s
      JOIN medicaments m ON s.medicament_id = m.id
      WHERE s.date_expiration IS NOT NULL
        AND s.date_expiration <= CURRENT_DATE + INTERVAL '30 days'
        AND s.quantite > 0
      ORDER BY s.date_expiration ASC
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Point de vente — vente directe sans ordonnance.
// Wrapped in prisma.$transaction so partial failure rolls back all stock
// movements + dispensations. Without this, a mid-cart error left stock
// decremented without a movement-log entry (cash-register integrity hazard).
router.post('/vente', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { items, patient_id } = req.body;
    // items: Array<{ medicament_id: number; quantite: number; prix_unitaire?: number }>
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Au moins un article requis' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      let totalVente = 0;
      const venteLignes: Array<{ medicament_nom: string; quantite: number; prix: number; montant: number }> = [];

      for (const item of items) {
        const { medicament_id, quantite } = item;
        if (!medicament_id || !quantite || quantite <= 0) continue;

        const med = await tx.medicament.findUnique({ where: { id: Number(medicament_id) } });
        if (!med) continue;

        const prix = item.prix_unitaire || Number(med.prixUnitaire) || 0;
        const montant = prix * quantite;
        totalVente += montant;

        // Decrement stock (FIFO — oldest lot first)
        const updated = await tx.$executeRaw`
          UPDATE stock SET quantite = quantite - ${Number(quantite)}
          WHERE id = (
            SELECT id FROM stock
            WHERE medicament_id = ${Number(medicament_id)} AND quantite >= ${Number(quantite)}
            ORDER BY date_expiration ASC NULLS LAST, date_entree ASC
            LIMIT 1
          )
        `;
        if (updated === 0) {
          throw new Error(`Stock insuffisant pour le médicament #${medicament_id}`);
        }

        await tx.stockMouvement.create({
          data: {
            medicamentId: Number(medicament_id),
            typeMouvement: 'sortie',
            quantite: Number(quantite),
            motif: `Vente directe${patient_id ? ` — Patient #${patient_id}` : ''}`,
            userId: req.user!.id,
          },
        });

        if (patient_id) {
          await tx.dispensation.create({
            data: {
              patientId: Number(patient_id),
              medicamentId: Number(medicament_id),
              quantiteDelivree: Number(quantite),
              dispenseurId: req.user!.id,
            },
          });
        }

        venteLignes.push({ medicament_nom: med.nom, quantite, prix, montant });
      }

      return { totalVente, venteLignes };
    });

    res.json({
      success: true,
      total: result.totalVente,
      lignes: result.venteLignes,
      date: new Date().toISOString(),
      vendeur: req.user!.username,
    });
  } catch (err) {
    console.error('[PHARMACIE] Vente error:', err);
    const message = err instanceof Error && err.message.startsWith('Stock insuffisant')
      ? err.message
      : 'Erreur lors de la vente';
    res.status(400).json({ error: message });
  }
});

// Import CSV de médicaments.
// Single batched createMany (skipDuplicates) replaces N sequential round-trips.
// The previous code ran a dead upsert({ where: { id: -1 } }) which always threw
// (caught silently) plus a raw INSERT — net 2 round-trips per row, dead code in one.
router.post('/import', authenticate, authorize('admin'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Fichier CSV requis' }); return; }

    const content = req.file.buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const startIdx = lines[0].toLowerCase().includes('nom') ? 1 : 0;
    const errors: string[] = [];
    const rows: Array<{
      nom: string;
      dci: string | null;
      forme: string | null;
      dosageStandard: string | null;
      categorie: string | null;
      prixUnitaire: number | null;
      codeBarre: string | null;
    }> = [];

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(/[;,\t]/).map(s => s.trim().replace(/^"|"$/g, ''));
      if (parts.length < 1 || !parts[0]) { errors.push(`Ligne ${i + 1}: nom requis`); continue; }
      const [nom, dci, forme, dosage, categorie, prixStr, codeBarre] = parts;
      rows.push({
        nom,
        dci: dci || null,
        forme: forme || null,
        dosageStandard: dosage || null,
        categorie: categorie || null,
        prixUnitaire: prixStr ? parseFloat(prixStr) : null,
        codeBarre: codeBarre || null,
      });
    }

    const result = rows.length > 0
      ? await prisma.medicament.createMany({ data: rows, skipDuplicates: true })
      : { count: 0 };

    res.json({
      imported: result.count,
      errors: errors.length > 0 ? errors : undefined,
      total: lines.length - startIdx,
    });
  } catch (err) { console.error('[PHARMACIE] Import error:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
