import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createTarifSchema, createFactureSchema, createPaiementSchema } from '../middleware/validation.js';
import { Prisma } from '@prisma/client';

const router = Router();

// === TARIFS ===
router.get('/tarifs', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { categorie, service_id } = req.query;
    const filters: Prisma.Sql[] = [Prisma.sql`t.actif = TRUE`];
    if (categorie) filters.push(Prisma.sql`t.categorie = ${String(categorie)}`);
    if (service_id) filters.push(Prisma.sql`t.service_id = ${Number(service_id)}`);
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT t.*, s.nom as service_nom
      FROM tarifs t
      LEFT JOIN services s ON t.service_id = s.id
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY t.categorie, t.libelle
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/tarifs', authenticate, authorize('admin', 'comptable'), validate(createTarifSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, libelle, categorie, montant, service_id } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.tarif.create({
      data: {
        code,
        libelle,
        categorie,
        montant,
        serviceId: n(service_id) as number | null,
      },
    });
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/tarifs/:id', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { code, libelle, categorie, montant, service_id, actif } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    try {
      const updated = await prisma.tarif.update({
        where: { id },
        data: {
          code,
          libelle,
          categorie,
          montant,
          serviceId: n(service_id) as number | null,
          actif: actif !== false,
        },
      });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === FACTURES ===
router.get('/factures', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, statut } = req.query;
    const filters: Prisma.Sql[] = [Prisma.sql`1=1`];
    if (patient_id) filters.push(Prisma.sql`f.patient_id = ${Number(patient_id)}`);
    if (statut) filters.push(Prisma.sql`f.statut = ${String(statut)}`);
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT f.*,
             p.nom as patient_nom, p.prenom as patient_prenom
      FROM factures f
      LEFT JOIN patients p ON f.patient_id = p.id
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY f.date_facture DESC
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/factures/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const factureRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT f.*,
             p.nom as patient_nom, p.prenom as patient_prenom, p.telephone as patient_telephone
      FROM factures f
      LEFT JOIN patients p ON f.patient_id = p.id
      WHERE f.id = ${id}
    `;
    if (factureRows.length === 0) { res.status(404).json({ error: 'Non trouvée' }); return; }
    const lignes = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT fl.*, t.code as tarif_code
      FROM facture_lignes fl
      LEFT JOIN tarifs t ON fl.tarif_id = t.id
      WHERE fl.facture_id = ${id}
    `;
    const paiements = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT pa.*, u.nom as recu_nom, u.prenom as recu_prenom
      FROM paiements pa
      LEFT JOIN users u ON pa.recu_par = u.id
      WHERE pa.facture_id = ${id}
      ORDER BY pa.date_paiement DESC
    `;
    res.json({ ...factureRows[0], lignes, paiements });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/factures', authenticate, authorize('admin', 'comptable'), validate(createFactureSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, lignes, notes } = req.body;
    // Generate invoice number
    const [countRow] = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint as c FROM factures WHERE DATE(created_at) = CURRENT_DATE
    `;
    const c = Number(countRow.c);
    const num = `FAC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(c + 1).padStart(4, '0')}`;
    const typedLignes = lignes as Array<{ tarif_id?: number; libelle: string; quantite?: number; prix_unitaire: number }>;
    const montant_total = typedLignes.reduce((s, l) => s + l.prix_unitaire * (l.quantite || 1), 0);

    const created = await prisma.$transaction(async (tx) => {
      const facture = await tx.facture.create({
        data: {
          numero: num,
          patientId: patient_id ?? null,
          montantTotal: montant_total,
          notes: notes || null,
          createdBy: req.user!.id,
        },
      });
      for (const l of typedLignes) {
        const montant = l.prix_unitaire * (l.quantite || 1);
        await tx.factureLigne.create({
          data: {
            factureId: facture.id,
            tarifId: l.tarif_id || null,
            libelle: l.libelle,
            quantite: l.quantite || 1,
            prixUnitaire: l.prix_unitaire,
            montant,
          },
        });
      }
      return facture;
    });

    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// === PAIEMENTS ===
router.post('/paiements', authenticate, authorize('admin', 'comptable'), validate(createPaiementSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { facture_id, montant, mode_paiement, reference, notes } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const paiement = await prisma.paiement.create({
      data: {
        factureId: Number(facture_id),
        montant,
        modePaiement: (n(mode_paiement) as string | null) || 'especes',
        reference: n(reference) as string | null,
        recuPar: req.user!.id,
        notes: n(notes) as string | null,
      },
    });

    // Update facture
    const agg = await prisma.paiement.aggregate({
      where: { factureId: Number(facture_id) },
      _sum: { montant: true },
    });
    const facture = await prisma.facture.findUnique({ where: { id: Number(facture_id) }, select: { montantTotal: true } });
    const paye = Number(agg._sum.montant ?? 0);
    const total = Number(facture?.montantTotal ?? 0);
    const statut = paye >= total ? 'payee' : 'partielle';
    await prisma.facture.update({
      where: { id: Number(facture_id) },
      data: { montantPaye: paye, statut },
    });

    res.status(201).json(paiement);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
