import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// === MEDICAMENTS ===
router.get('/medicaments', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, categorie } = req.query;
    let sql = 'SELECT * FROM medicaments WHERE actif = TRUE';
    const params: unknown[] = [];
    if (search) { params.push(`%${search}%`); sql += ` AND (nom ILIKE $${params.length} OR dci ILIKE $${params.length})`; }
    if (categorie) { params.push(categorie); sql += ` AND categorie = $${params.length}`; }
    sql += ' ORDER BY nom';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/medicaments', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, dci, forme, dosage_standard, code_barre, categorie, prix_unitaire } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('INSERT INTO medicaments (nom, dci, forme, dosage_standard, code_barre, categorie, prix_unitaire) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [nom, n(dci), n(forme), n(dosage_standard), n(code_barre), n(categorie), n(prix_unitaire)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === STOCK ===
router.get('/stock', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT s.*, m.nom as medicament_nom, m.forme, m.dci FROM stock s LEFT JOIN medicaments m ON s.medicament_id = m.id ORDER BY m.nom, s.date_expiration`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/stock', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicament_id, lot, date_expiration, quantite, quantite_min, prix_achat, fournisseur } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('INSERT INTO stock (medicament_id, lot, date_expiration, quantite, quantite_min, prix_achat, fournisseur) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [medicament_id, n(lot), n(date_expiration), quantite || 0, quantite_min || 10, n(prix_achat), n(fournisseur)]);
    // Log mouvement entree
    await query('INSERT INTO stock_mouvements (medicament_id, type_mouvement, quantite, lot, motif, user_id) VALUES ($1,$2,$3,$4,$5,$6)', [medicament_id, 'entree', quantite || 0, n(lot), 'Entrée stock initiale', req.user!.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// === MOUVEMENTS ===
router.get('/mouvements', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT sm.*, m.nom as medicament_nom, u.nom as user_nom, u.prenom as user_prenom FROM stock_mouvements sm LEFT JOIN medicaments m ON sm.medicament_id = m.id LEFT JOIN users u ON sm.user_id = u.id ORDER BY sm.created_at DESC LIMIT 100`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/mouvements', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicament_id, type_mouvement, quantite, lot, motif } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    await query('INSERT INTO stock_mouvements (medicament_id, type_mouvement, quantite, lot, motif, user_id) VALUES ($1,$2,$3,$4,$5,$6)', [medicament_id, type_mouvement, quantite, n(lot), n(motif), req.user!.id]);
    // Update stock quantity
    if (type_mouvement === 'entree') {
      await query('UPDATE stock SET quantite = quantite + $1 WHERE medicament_id = $2 AND (lot = $3 OR $3 IS NULL)', [quantite, medicament_id, n(lot)]);
    } else if (type_mouvement === 'sortie') {
      await query('UPDATE stock SET quantite = quantite - $1 WHERE medicament_id = $2 AND (lot = $3 OR $3 IS NULL)', [quantite, medicament_id, n(lot)]);
    }
    res.json({ message: 'Mouvement enregistré' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// === DISPENSATIONS ===
router.post('/dispensations', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, prescription_id, medicament_id, quantite_delivree, notes } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const result = await query('INSERT INTO dispensations (patient_id, prescription_id, medicament_id, quantite_delivree, dispenseur_id, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [patient_id, n(prescription_id), medicament_id, quantite_delivree, req.user!.id, n(notes)]);
    // Decrease stock
    await query('UPDATE stock SET quantite = quantite - $1 WHERE medicament_id = $2 AND quantite >= $1 LIMIT 1', [quantite_delivree, medicament_id]);
    await query('INSERT INTO stock_mouvements (medicament_id, type_mouvement, quantite, motif, user_id) VALUES ($1,$2,$3,$4,$5)', [medicament_id, 'sortie', quantite_delivree, `Dispensation patient #${patient_id}`, req.user!.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// === ALERTES ===
router.get('/alertes', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stockBas = await query(`SELECT s.*, m.nom as medicament_nom FROM stock s LEFT JOIN medicaments m ON s.medicament_id = m.id WHERE s.quantite <= s.quantite_min AND s.quantite > 0`);
    const rupture = await query(`SELECT s.*, m.nom as medicament_nom FROM stock s LEFT JOIN medicaments m ON s.medicament_id = m.id WHERE s.quantite = 0`);
    const perimes = await query(`SELECT s.*, m.nom as medicament_nom FROM stock s LEFT JOIN medicaments m ON s.medicament_id = m.id WHERE s.date_expiration < CURRENT_DATE`);
    const bientotPerimes = await query(`SELECT s.*, m.nom as medicament_nom FROM stock s LEFT JOIN medicaments m ON s.medicament_id = m.id WHERE s.date_expiration BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`);
    res.json({ stockBas: stockBas.rows, rupture: rupture.rows, perimes: perimes.rows, bientotPerimes: bientotPerimes.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;