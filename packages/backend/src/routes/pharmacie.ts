import { Router, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createMedicamentSchema, createStockSchema, createMouvementSchema } from '../middleware/validation.js';
import { notifyMany } from '../services/notify.js';
import { billPharmacie, billDispensation } from '../services/billing.js';
import { auditUpdate } from '../services/audit.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Prisma returns camelCase (dosageStandard, codeBarre, prixUnitaire) but the
// frontend catalogue table and PharmacieMedicamentForm read snake_case —
// same class of bug already fixed on /patients/:id/historique. Without this
// mapping, dosage/prix/code-barre silently render blank after saving.
type MedicamentRow = Awaited<ReturnType<typeof prisma.medicament.findFirst>>;
function toMedicamentDTO(m: NonNullable<MedicamentRow>) {
  return {
    id: m.id,
    nom: m.nom,
    dci: m.dci,
    forme: m.forme,
    dosage_standard: m.dosageStandard,
    code_barre: m.codeBarre,
    categorie: m.categorie,
    prix_unitaire: m.prixUnitaire,
    actif: m.actif,
    created_at: m.createdAt,
  };
}

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
    res.json(rows.map(toMedicamentDTO));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Single medicament — used by PharmacieMedicamentForm (view/edit) and the
// catalogue detail link. Was missing entirely, so opening any medicament
// 404'd (frontend route: GET /pharmacie/medicaments/:id).
router.get('/medicaments/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const med = await prisma.medicament.findUnique({ where: { id } });
    if (!med) { res.status(404).json({ error: 'Médicament non trouvé' }); return; }
    res.json(toMedicamentDTO(med));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/medicaments', authenticate, authorize('admin', 'pharmacien'), validate(createMedicamentSchema), async (req: AuthRequest, res: Response): Promise<void> => {
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
    res.status(201).json(toMedicamentDTO(created));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/medicaments/:id', authenticate, authorize('admin', 'pharmacien'), validate(createMedicamentSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.medicament.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Médicament non trouvé' }); return; }
    const { nom, dci, forme, dosage_standard, code_barre, categorie, prix_unitaire } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const updated = await prisma.medicament.update({
      where: { id },
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
    res.json(toMedicamentDTO(updated));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/medicaments/:id', authenticate, authorize('admin', 'pharmacien'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.medicament.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Médicament non trouvé' }); return; }
    await prisma.medicament.update({ where: { id }, data: { actif: false } });
    res.json({ message: 'Médicament désactivé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === DISPENSATIONS ===
router.get('/dispensations', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.dispensation.findMany({ orderBy: { dateDispensation: 'desc' }, take: 100 });
    const patientIds = Array.from(new Set(rows.map(d => d.patientId).filter((v): v is number => v != null)));
    const medIds = Array.from(new Set(rows.map(d => d.medicamentId).filter((v): v is number => v != null)));
    const userIds = Array.from(new Set(rows.map(d => d.dispenseurId).filter((v): v is number => v != null)));
    const [patients, meds, users] = await Promise.all([
      patientIds.length > 0 ? prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, nom: true, prenom: true } }) : Promise.resolve([]),
      medIds.length > 0 ? prisma.medicament.findMany({ where: { id: { in: medIds } }, select: { id: true, nom: true } }) : Promise.resolve([]),
      userIds.length > 0 ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nom: true, prenom: true } }) : Promise.resolve([]),
    ]);
    const patientMap = new Map(patients.map(p => [p.id, p]));
    const medMap = new Map(meds.map(m => [m.id, m]));
    const userMap = new Map(users.map(u => [u.id, u]));
    const mapped = rows.map(d => ({
      ...d,
      patient_nom: d.patientId != null ? (patientMap.get(d.patientId)?.nom ?? null) : null,
      patient_prenom: d.patientId != null ? (patientMap.get(d.patientId)?.prenom ?? null) : null,
      medicament_nom: d.medicamentId != null ? (medMap.get(d.medicamentId)?.nom ?? null) : null,
      dispenseur_nom: d.dispenseurId != null ? (userMap.get(d.dispenseurId)?.nom ?? null) : null,
      dispenseur_prenom: d.dispenseurId != null ? (userMap.get(d.dispenseurId)?.prenom ?? null) : null,
    }));
    res.json(mapped);
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

router.post('/stock', authenticate, authorize('admin', 'pharmacien'), validate(createStockSchema), async (req: AuthRequest, res: Response): Promise<void> => {
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
    // Was `{ ...s, ... }` — spread the raw Prisma row (camelCase: typeMouvement,
    // createdAt) while the frontend table reads type_mouvement/created_at,
    // so the type tag never rendered and the date showed "Invalid Date".
    const mapped = rows.map(s => ({
      id: s.id,
      medicament_id: s.medicamentId,
      type_mouvement: s.typeMouvement,
      quantite: s.quantite,
      lot: s.lot,
      motif: s.motif,
      user_id: s.userId,
      created_at: s.createdAt,
      statut: s.statut,
      medicament_nom: s.medicamentId != null ? (medMap.get(s.medicamentId)?.nom ?? null) : null,
      user_nom: s.userId != null ? (userMap.get(s.userId)?.nom ?? null) : null,
      user_prenom: s.userId != null ? (userMap.get(s.userId)?.prenom ?? null) : null,
    }));
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

/**
 * After a stock-decreasing operation, check if total stock for this medication
 * has crossed below `quantite_min` and notify admins. Dedupes by suppressing
 * the alert if any admin has an unread `stock_low` notif for this medication
 * created within the last hour — prevents spam when several dispensations
 * happen in a row while stock is already low.
 */
async function checkLowStockAndNotify(medicamentId: number | null | undefined): Promise<void> {
  if (!medicamentId) return;
  try {
    const stocks = await prisma.stock.findMany({ where: { medicamentId } });
    if (stocks.length === 0) return;
    const totalQty = stocks.reduce((acc, s) => acc + (s.quantite ?? 0), 0);
    const minQty = Math.max(...stocks.map(s => s.quantiteMin ?? 0));
    if (totalQty > minQty) return; // not low

    const medicament = await prisma.medicament.findUnique({ where: { id: medicamentId }, select: { nom: true } });
    const label = medicament?.nom ?? `medicament #${medicamentId}`;
    const isOutOfStock = totalQty === 0;

    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Filter out admins who already have an unread stock_low notif for this med within the last hour.
    const recipients: number[] = [];
    for (const a of admins) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: a.id,
          type: 'stock_low',
          read: false,
          createdAt: { gt: oneHourAgo },
          body: { contains: label, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (!existing) recipients.push(a.id);
    }

    if (recipients.length === 0) return;
    await notifyMany(recipients, {
      type: 'stock_low',
      title: isOutOfStock ? `Rupture de stock : ${label}` : `Stock bas : ${label}`,
      body: `Quantité totale : ${totalQty} (seuil ${minQty})`,
      link: '/app/pharmacie',
    });
  } catch (err) {
    console.error('[PHARMACIE] low-stock notification check failed:', err);
  }
}

// Resolve the single stock row a mouvement without an explicit lot should
// act on: the named lot if given, otherwise the FIFO-oldest (soonest to
// expire) row for that medicament. Shared by creation and by the 'perime'
// approval step, which re-resolves at approval time since stock may have
// moved between the write-off request and the admin's decision.
async function resolveStockTarget(medicamentId: number, lotVal: string | null): Promise<import('@prisma/client').Stock | null> {
  const candidates = await prisma.stock.findMany({
    where: { medicamentId, ...(lotVal ? { lot: lotVal } : {}) },
    orderBy: [{ dateExpiration: 'asc' }, { dateEntree: 'asc' }],
  });
  return candidates[0] ?? null;
}

router.post('/mouvements', authenticate, validate(createMouvementSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicament_id, type_mouvement, quantite, lot, motif } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const lotVal = n(lot) as string | null;

    // Was `WHERE medicament_id = X AND (lot = $lot OR $lot IS NULL)` — when no
    // lot is picked, "$lot IS NULL" is true for every row, so the UPDATE hit
    // *every* lot of that medicament and applied the full delta to each one
    // (e.g. "sortie" of 5 across 3 lots silently removed 15). It also never
    // checked available quantity, so a sortie could push stock negative.
    // Fix: resolve to exactly one stock row and validate against it.
    //   entree      → add quantite to the target row.
    //   sortie      → subtract, rejected if it would go negative.
    //   ajustement  → correction: SET the target row to quantite (the counted
    //                 true value), not a delta.
    //   perime      → expired stock to write off. Doesn't touch stock here —
    //                 stays 'en_attente' until an admin approves (see
    //                 POST /mouvements/:id/approuver), which is where the
    //                 actual decrement + sufficiency check happens.
    let target: import('@prisma/client').Stock | null = null;
    if (type_mouvement !== 'perime') {
      target = await resolveStockTarget(medicament_id, lotVal);
      if (!target) {
        res.status(400).json({ error: lotVal ? `Aucun stock pour le lot "${lotVal}"` : 'Aucun stock pour ce médicament' });
        return;
      }
      if (type_mouvement === 'sortie' && target.quantite < quantite) {
        res.status(400).json({ error: `Stock insuffisant (disponible : ${target.quantite}, demandé : ${quantite})` });
        return;
      }
    } else {
      // Creation-time sanity check only (does the medicament/lot exist at
      // all) — the authoritative sufficiency check happens at approval time.
      const exists = await resolveStockTarget(medicament_id, lotVal);
      if (!exists) {
        res.status(400).json({ error: lotVal ? `Aucun stock pour le lot "${lotVal}"` : 'Aucun stock pour ce médicament' });
        return;
      }
    }

    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.stockMouvement.create({
        data: {
          medicamentId: medicament_id ?? null,
          typeMouvement: type_mouvement,
          quantite,
          lot: lotVal,
          motif: n(motif) as string | null,
          userId: req.user!.id,
          statut: type_mouvement === 'perime' ? 'en_attente' : 'valide',
        },
      }),
    ];
    if (target) {
      writes.push(prisma.stock.update({
        where: { id: target.id },
        data: {
          quantite:
            type_mouvement === 'entree' ? target.quantite + quantite :
            type_mouvement === 'ajustement' ? quantite :
            target.quantite - quantite, // sortie
        },
      }));
    }

    await prisma.$transaction(writes);
    if (type_mouvement === 'sortie') await checkLowStockAndNotify(medicament_id);

    if (type_mouvement === 'perime') {
      const [admins, medicament] = await Promise.all([
        prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } }),
        prisma.medicament.findUnique({ where: { id: medicament_id }, select: { nom: true } }),
      ]);
      await notifyMany(admins.map(a => a.id), {
        type: 'stock_perime_approval',
        title: `Péremption à valider : ${medicament?.nom ?? `médicament #${medicament_id}`}`,
        body: `Quantité ${quantite}${lotVal ? ` — Lot ${lotVal}` : ''} — déclaré par ${req.user!.username}${motif ? ` — ${motif}` : ''}`,
        link: '/app/pharmacie',
      });
    }

    res.json({ message: type_mouvement === 'perime' ? 'Mouvement enregistré — en attente de validation admin' : 'Mouvement enregistré' });
  } catch (err) { console.error('[PHARMACIE] Mouvement error:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Admin decision on a pending 'perime' write-off. Approving is where the
// stock actually gets decremented — re-resolved and re-checked for
// sufficiency now, since time has passed since the request was filed.
router.post('/mouvements/:id/approuver', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const mvt = await prisma.stockMouvement.findUnique({ where: { id } });
    if (!mvt) { res.status(404).json({ error: 'Mouvement non trouvé' }); return; }
    if (mvt.typeMouvement !== 'perime' || mvt.statut !== 'en_attente') {
      res.status(400).json({ error: 'Ce mouvement ne peut pas être approuvé' });
      return;
    }
    if (!mvt.medicamentId) { res.status(400).json({ error: 'Médicament manquant sur ce mouvement' }); return; }

    const target = await resolveStockTarget(mvt.medicamentId, mvt.lot);
    if (!target || target.quantite < mvt.quantite) {
      res.status(400).json({ error: `Stock insuffisant pour valider ce retrait (disponible : ${target?.quantite ?? 0}, demandé : ${mvt.quantite})` });
      return;
    }

    await prisma.$transaction([
      prisma.stock.update({ where: { id: target.id }, data: { quantite: target.quantite - mvt.quantite } }),
      prisma.stockMouvement.update({ where: { id }, data: { statut: 'valide' } }),
    ]);
    auditUpdate(req.user!.id, 'stock_mouvements', id, { statut: 'en_attente' }, { statut: 'valide' });
    await checkLowStockAndNotify(mvt.medicamentId);
    res.json({ message: 'Retrait pour péremption approuvé' });
  } catch (err) { console.error('[PHARMACIE] Approbation mouvement error:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/mouvements/:id/rejeter', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const mvt = await prisma.stockMouvement.findUnique({ where: { id } });
    if (!mvt) { res.status(404).json({ error: 'Mouvement non trouvé' }); return; }
    if (mvt.typeMouvement !== 'perime' || mvt.statut !== 'en_attente') {
      res.status(400).json({ error: 'Ce mouvement ne peut pas être rejeté' });
      return;
    }
    await prisma.stockMouvement.update({ where: { id }, data: { statut: 'rejete' } });
    auditUpdate(req.user!.id, 'stock_mouvements', id, { statut: 'en_attente' }, { statut: 'rejete' });
    res.json({ message: 'Retrait pour péremption rejeté' });
  } catch (err) { console.error('[PHARMACIE] Rejet mouvement error:', err); res.status(500).json({ error: 'Erreur serveur' }); }
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
    await checkLowStockAndNotify(medicament_id);
    if (patient_id) {
      const medPrice = await prisma.medicament.findUnique({ where: { id: Number(medicament_id) }, select: { prixUnitaire: true } });
      const montantDisp = (Number(medPrice?.prixUnitaire) || 0) * Number(quantite_delivree);
      billDispensation({
        patientId: Number(patient_id),
        montant: montantDisp,
        sourceId: created.id,
        userId: req.user!.id,
      }).catch(err => console.error('[BILLING] Dispensation billing failed:', err));
    }
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
      let lastMouvementId = 0;
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

        const mouvement = await tx.stockMouvement.create({
          data: {
            medicamentId: Number(medicament_id),
            typeMouvement: 'sortie',
            quantite: Number(quantite),
            motif: `Vente directe${patient_id ? ` — Patient #${patient_id}` : ''}`,
            userId: req.user!.id,
          },
        });
        lastMouvementId = mouvement.id;

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

      return { totalVente, venteLignes, lastMouvementId };
    });

    billPharmacie({
      patientId: patient_id ? Number(patient_id) : null,
      montant: result.totalVente,
      typeActe: 'Vente pharmacie',
      sourceId: result.lastMouvementId,
      userId: req.user!.id,
    }).catch(err => console.error('[BILLING] Pharmacy sale billing failed:', err));

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
router.post('/import', authenticate, authorize('admin', 'pharmacien'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
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
