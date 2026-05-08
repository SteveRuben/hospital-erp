import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { auditCreate, auditUpdate } from '../services/audit.js';

const router = Router();

// === TARIFS ===
router.get('/tarifs', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { categorie, service_id } = req.query;
    let sql = `SELECT t.*, s.nom as service_nom FROM tarifs t LEFT JOIN services s ON t.service_id = s.id WHERE t.actif = TRUE`;
    const params: unknown[] = [];
    if (categorie) { params.push(categorie); sql += ` AND t.categorie = $${params.length}`; }
    if (service_id) { params.push(service_id); sql += ` AND t.service_id = $${params.length}`; }
    sql += ' ORDER BY t.categorie, t.libelle';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/tarifs', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, libelle, categorie, montant, service_id } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('INSERT INTO tarifs (code, libelle, categorie, montant, service_id) VALUES ($1,$2,$3,$4,$5) RETURNING *', [code, libelle, categorie, montant, n(service_id)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/tarifs/:id', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, libelle, categorie, montant, service_id, actif } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('UPDATE tarifs SET code=$1, libelle=$2, categorie=$3, montant=$4, service_id=$5, actif=$6 WHERE id=$7 RETURNING *', [code, libelle, categorie, montant, n(service_id), actif !== false, req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Non trouvé' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === FACTURES ===
router.get('/factures', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, statut } = req.query;
    let sql = `SELECT f.*, p.nom as patient_nom, p.prenom as patient_prenom FROM factures f LEFT JOIN patients p ON f.patient_id = p.id WHERE 1=1`;
    const params: unknown[] = [];
    if (patient_id) { params.push(patient_id); sql += ` AND f.patient_id = $${params.length}`; }
    if (statut) { params.push(statut); sql += ` AND f.statut = $${params.length}`; }
    sql += ' ORDER BY f.date_facture DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/factures/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const facture = await query(`SELECT f.*, p.nom as patient_nom, p.prenom as patient_prenom, p.telephone as patient_telephone FROM factures f LEFT JOIN patients p ON f.patient_id = p.id WHERE f.id = $1`, [req.params.id]);
    if (facture.rows.length === 0) { res.status(404).json({ error: 'Non trouvée' }); return; }
    const lignes = await query('SELECT fl.*, t.code as tarif_code FROM facture_lignes fl LEFT JOIN tarifs t ON fl.tarif_id = t.id WHERE fl.facture_id = $1', [req.params.id]);
    const paiements = await query('SELECT pa.*, u.nom as recu_nom, u.prenom as recu_prenom FROM paiements pa LEFT JOIN users u ON pa.recu_par = u.id WHERE pa.facture_id = $1 ORDER BY pa.date_paiement DESC', [req.params.id]);
    res.json({ ...facture.rows[0], lignes: lignes.rows, paiements: paiements.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/factures', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, lignes, notes } = req.body;
    // Generate invoice number
    const countResult = await query("SELECT COUNT(*) as c FROM factures WHERE DATE(created_at) = CURRENT_DATE");
    const num = `FAC-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(parseInt(countResult.rows[0].c as string) + 1).padStart(4, '0')}`;
    const montant_total = (lignes as Array<{prix_unitaire: number; quantite: number}>).reduce((s: number, l) => s + l.prix_unitaire * (l.quantite || 1), 0);
    
    const facture = await query('INSERT INTO factures (numero, patient_id, montant_total, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [num, patient_id, montant_total, notes || null, req.user!.id]);
    const factureId = facture.rows[0].id;
    
    for (const l of (lignes as Array<{tarif_id?: number; libelle: string; quantite?: number; prix_unitaire: number}>)) {
      const montant = l.prix_unitaire * (l.quantite || 1);
      await query('INSERT INTO facture_lignes (facture_id, tarif_id, libelle, quantite, prix_unitaire, montant) VALUES ($1,$2,$3,$4,$5,$6)', [factureId, l.tarif_id || null, l.libelle, l.quantite || 1, l.prix_unitaire, montant]);
    }
    
    res.status(201).json(facture.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// === PAIEMENTS ===
router.post('/paiements', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { facture_id, montant, mode_paiement, reference, notes } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const paiement = await query('INSERT INTO paiements (facture_id, montant, mode_paiement, reference, recu_par, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [facture_id, montant, n(mode_paiement) || 'especes', n(reference), req.user!.id, n(notes)]);
    
    // Update facture
    const totalPaye = await query('SELECT COALESCE(SUM(montant), 0) as total FROM paiements WHERE facture_id = $1', [facture_id]);
    const facture = await query('SELECT montant_total FROM factures WHERE id = $1', [facture_id]);
    const paye = parseFloat(totalPaye.rows[0].total as string);
    const total = parseFloat(facture.rows[0].montant_total as string);
    const statut = paye >= total ? 'payee' : 'partielle';
    await query('UPDATE factures SET montant_paye = $1, statut = $2 WHERE id = $3', [paye, statut, facture_id]);
    
    res.status(201).json(paiement.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;