import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createRecetteSchema, createDepenseSchema } from '../middleware/validation.js';
import { auditCreate, auditDelete } from '../services/audit.js';
import { Prisma } from '@prisma/client';

const router = Router();

// Recettes
router.get('/recettes', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date_debut, date_fin, service_id, patient_id, inclure_annulees } = req.query;
    const filters: Prisma.Sql[] = [Prisma.sql`1=1`];
    if (!inclure_annulees) filters.push(Prisma.sql`(r.annulee = FALSE OR r.annulee IS NULL)`);
    if (date_debut) filters.push(Prisma.sql`r.date_recette >= ${String(date_debut)}::date`);
    if (date_fin) filters.push(Prisma.sql`r.date_recette <= ${String(date_fin)}::date`);
    if (service_id) filters.push(Prisma.sql`r.service_id = ${Number(service_id)}`);
    if (patient_id) filters.push(Prisma.sql`r.patient_id = ${Number(patient_id)}`);
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT r.*,
             p.nom as patient_nom, p.prenom as patient_prenom,
             s.nom as service_nom
      FROM recettes r
      LEFT JOIN patients p ON r.patient_id = p.id
      LEFT JOIN services s ON r.service_id = s.id
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY r.date_recette DESC, r.id DESC
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/recettes', authenticate, authorize('admin', 'comptable'), validate(createRecetteSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, service_id, type_acte, montant, mode_paiement, description } = req.body;
    const created = await prisma.recette.create({
      data: {
        patientId: patient_id ?? null,
        serviceId: service_id ?? null,
        typeActe: type_acte,
        montant,
        modePaiement: mode_paiement ?? null,
        description: description ?? null,
      },
    });
    auditCreate(req.user!.id, 'recettes', created.id, `Recette ${type_acte}: ${montant} XAF`);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/recettes/:id', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // SECURITY: Soft-delete via annulation (comptabilité exige conservation des écritures)
    const id = Number(req.params.id);
    const existing = await prisma.recette.findUnique({ where: { id }, select: { id: true, annulee: true } });
    if (!existing) { res.status(404).json({ error: 'Recette non trouvée' }); return; }
    if (existing.annulee) { res.status(400).json({ error: 'Recette déjà annulée' }); return; }
    await prisma.recette.update({
      where: { id },
      data: { annulee: true, dateAnnulation: new Date(), annuleePar: req.user!.id },
    });
    auditDelete(req.user!.id, 'recettes', id, 'Recette annulée (contre-passation)');
    res.json({ message: 'Recette annulée (contre-passation)' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Dépenses
router.get('/depenses', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date_debut, date_fin, type_depense, inclure_annulees } = req.query;
    const filters: Prisma.Sql[] = [Prisma.sql`1=1`];
    if (!inclure_annulees) filters.push(Prisma.sql`(annulee = FALSE OR annulee IS NULL)`);
    if (date_debut) filters.push(Prisma.sql`date_depense >= ${String(date_debut)}::date`);
    if (date_fin) filters.push(Prisma.sql`date_depense <= ${String(date_fin)}::date`);
    if (type_depense) filters.push(Prisma.sql`type_depense = ${String(type_depense)}`);
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM depenses
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY date_depense DESC, id DESC
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/depenses', authenticate, authorize('admin', 'comptable'), validate(createDepenseSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type_depense, nature, montant, fournisseur, description, date_depense } = req.body;
    const created = await prisma.depense.create({
      data: {
        typeDepense: type_depense,
        nature: nature ?? null,
        montant,
        fournisseur: fournisseur ?? null,
        description: description ?? null,
        dateDepense: date_depense ? new Date(date_depense) : new Date(),
      },
    });
    auditCreate(req.user!.id, 'depenses', created.id, `Dépense ${type_depense}: ${montant} XAF`);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/depenses/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // SECURITY: Soft-delete via annulation (comptabilité exige conservation des écritures)
    const id = Number(req.params.id);
    const existing = await prisma.depense.findUnique({ where: { id }, select: { id: true, annulee: true } });
    if (!existing) { res.status(404).json({ error: 'Dépense non trouvée' }); return; }
    if (existing.annulee) { res.status(400).json({ error: 'Dépense déjà annulée' }); return; }
    await prisma.depense.update({
      where: { id },
      data: { annulee: true, dateAnnulation: new Date(), annuleePar: req.user!.id },
    });
    auditDelete(req.user!.id, 'depenses', id, 'Dépense annulée (contre-passation)');
    res.json({ message: 'Dépense annulée (contre-passation)' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Caisse — exclude annulled records
router.get('/caisse', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [recettesAgg] = await prisma.$queryRaw<Array<{ total: string | number }>>`
      SELECT COALESCE(SUM(montant), 0) as total
      FROM recettes
      WHERE date_recette = ${today}::date
        AND mode_paiement = 'especes'
        AND (annulee = FALSE OR annulee IS NULL)
    `;
    const [depensesAgg] = await prisma.$queryRaw<Array<{ total: string | number }>>`
      SELECT COALESCE(SUM(montant), 0) as total
      FROM depenses
      WHERE date_depense = ${today}::date
        AND (annulee = FALSE OR annulee IS NULL)
    `;
    const recettes = Number(recettesAgg.total);
    const depenses = Number(depensesAgg.total);
    res.json({ date: today, recettes, depenses, solde: recettes - depenses });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Bilan — exclude annulled records
router.get('/bilan', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { annee, mois } = req.query;
    const year = Number(annee) || new Date().getFullYear();
    const month = Number(mois) || new Date().getMonth() + 1;
    const debut = `${year}-${String(month).padStart(2, '0')}-01`;
    const fin = new Date(year, month, 0).toISOString().split('T')[0];
    const recettes = await prisma.$queryRaw<Array<{ total: string | number; type_acte: string }>>`
      SELECT COALESCE(SUM(montant), 0) as total, type_acte
      FROM recettes
      WHERE date_recette >= ${debut}::date
        AND date_recette <= ${fin}::date
        AND (annulee = FALSE OR annulee IS NULL)
      GROUP BY type_acte
    `;
    const depenses = await prisma.$queryRaw<Array<{ total: string | number; type_depense: string }>>`
      SELECT COALESCE(SUM(montant), 0) as total, type_depense
      FROM depenses
      WHERE date_depense >= ${debut}::date
        AND date_depense <= ${fin}::date
        AND (annulee = FALSE OR annulee IS NULL)
      GROUP BY type_depense
    `;
    const recettesOut = recettes.map(r => ({ total: Number(r.total), type_acte: r.type_acte }));
    const depensesOut = depenses.map(d => ({ total: Number(d.total), type_depense: d.type_depense }));
    const totalRecettes = recettesOut.reduce((sum, r) => sum + r.total, 0);
    const totalDepenses = depensesOut.reduce((sum, d) => sum + d.total, 0);
    res.json({ periode: { debut, fin }, recettes: recettesOut, depenses: depensesOut, totalRecettes, totalDepenses, resultatNet: totalRecettes - totalDepenses });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
