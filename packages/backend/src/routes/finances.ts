import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { auditCreate, auditDelete } from '../services/audit.js';

const router = Router();

// Recettes
router.get('/recettes', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date_debut, date_fin, service_id, patient_id, inclure_annulees } = req.query;
    let sql = `SELECT r.*, p.nom as patient_nom, p.prenom as patient_prenom, s.nom as service_nom FROM recettes r LEFT JOIN patients p ON r.patient_id = p.id LEFT JOIN services s ON r.service_id = s.id WHERE 1=1`;
    const params: unknown[] = [];
    // By default, exclude annulled records
    if (!inclure_annulees) { sql += ` AND (r.annulee = FALSE OR r.annulee IS NULL)`; }
    if (date_debut) { params.push(date_debut); sql += ` AND r.date_recette >= $${params.length}`; }
    if (date_fin) { params.push(date_fin); sql += ` AND r.date_recette <= $${params.length}`; }
    if (service_id) { params.push(service_id); sql += ` AND r.service_id = $${params.length}`; }
    if (patient_id) { params.push(patient_id); sql += ` AND r.patient_id = $${params.length}`; }
    sql += ' ORDER BY r.date_recette DESC, r.id DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/recettes', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, service_id, type_acte, montant, mode_paiement, description } = req.body;
    const result = await query(`INSERT INTO recettes (patient_id, service_id, type_acte, montant, mode_paiement, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [patient_id, service_id, type_acte, montant, mode_paiement, description]);
    auditCreate(req.user!.id, 'recettes', result.rows[0].id, `Recette ${type_acte}: ${montant} XAF`);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/recettes/:id', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // SECURITY: Soft-delete via annulation (comptabilité exige conservation des écritures)
    const existing = await query('SELECT id, annulee FROM recettes WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) { res.status(404).json({ error: 'Recette non trouvée' }); return; }
    if (existing.rows[0].annulee) { res.status(400).json({ error: 'Recette déjà annulée' }); return; }
    await query('UPDATE recettes SET annulee = TRUE, date_annulation = NOW(), annulee_par = $1 WHERE id = $2', [req.user!.id, req.params.id]);
    auditDelete(req.user!.id, 'recettes', Number(req.params.id), 'Recette annulée (contre-passation)');
    res.json({ message: 'Recette annulée (contre-passation)' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Dépenses
router.get('/depenses', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date_debut, date_fin, type_depense, inclure_annulees } = req.query;
    let sql = 'SELECT * FROM depenses WHERE 1=1';
    const params: unknown[] = [];
    // By default, exclude annulled records
    if (!inclure_annulees) { sql += ` AND (annulee = FALSE OR annulee IS NULL)`; }
    if (date_debut) { params.push(date_debut); sql += ` AND date_depense >= $${params.length}`; }
    if (date_fin) { params.push(date_fin); sql += ` AND date_depense <= $${params.length}`; }
    if (type_depense) { params.push(type_depense); sql += ` AND type_depense = $${params.length}`; }
    sql += ' ORDER BY date_depense DESC, id DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/depenses', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type_depense, nature, montant, fournisseur, description, date_depense } = req.body;
    const result = await query(`INSERT INTO depenses (type_depense, nature, montant, fournisseur, description, date_depense) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [type_depense, nature, montant, fournisseur, description, date_depense]);
    auditCreate(req.user!.id, 'depenses', result.rows[0].id, `Dépense ${type_depense}: ${montant} XAF`);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/depenses/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // SECURITY: Soft-delete via annulation (comptabilité exige conservation des écritures)
    const existing = await query('SELECT id, annulee FROM depenses WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) { res.status(404).json({ error: 'Dépense non trouvée' }); return; }
    if (existing.rows[0].annulee) { res.status(400).json({ error: 'Dépense déjà annulée' }); return; }
    await query('UPDATE depenses SET annulee = TRUE, date_annulation = NOW(), annulee_par = $1 WHERE id = $2', [req.user!.id, req.params.id]);
    auditDelete(req.user!.id, 'depenses', Number(req.params.id), 'Dépense annulée (contre-passation)');
    res.json({ message: 'Dépense annulée (contre-passation)' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Caisse — exclude annulled records
router.get('/caisse', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const recettes = await query("SELECT COALESCE(SUM(montant), 0) as total FROM recettes WHERE date_recette = $1 AND mode_paiement = 'especes' AND (annulee = FALSE OR annulee IS NULL)", [today]);
    const depenses = await query('SELECT COALESCE(SUM(montant), 0) as total FROM depenses WHERE date_depense = $1 AND (annulee = FALSE OR annulee IS NULL)', [today]);
    const solde = parseFloat(recettes.rows[0].total as string) - parseFloat(depenses.rows[0].total as string);
    res.json({ date: today, recettes: parseFloat(recettes.rows[0].total as string), depenses: parseFloat(depenses.rows[0].total as string), solde });
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
    const recettes = await query('SELECT COALESCE(SUM(montant), 0) as total, type_acte FROM recettes WHERE date_recette >= $1 AND date_recette <= $2 AND (annulee = FALSE OR annulee IS NULL) GROUP BY type_acte', [debut, fin]);
    const depenses = await query('SELECT COALESCE(SUM(montant), 0) as total, type_depense FROM depenses WHERE date_depense >= $1 AND date_depense <= $2 AND (annulee = FALSE OR annulee IS NULL) GROUP BY type_depense', [debut, fin]);
    const totalRecettes = recettes.rows.reduce((sum: number, r: { total: string }) => sum + parseFloat(r.total), 0);
    const totalDepenses = depenses.rows.reduce((sum: number, d: { total: string }) => sum + parseFloat(d.total), 0);
    res.json({ periode: { debut, fin }, recettes: recettes.rows, depenses: depenses.rows, totalRecettes, totalDepenses, resultatNet: totalRecettes - totalDepenses });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
