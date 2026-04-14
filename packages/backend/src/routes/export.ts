import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Helper: generate CSV content
const toCsv = (headers: string[], rows: Record<string, unknown>[], keys: string[]): string => {
  const lines = [headers.join(';')];
  for (const row of rows) {
    lines.push(keys.map(k => {
      const val = String(row[k] ?? '').replace(/;/g, ',').replace(/\n/g, ' ');
      return `"${val}"`;
    }).join(';'));
  }
  return '\ufeff' + lines.join('\n'); // BOM for Excel
};

// Export recettes
router.get('/recettes', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { debut, fin } = req.query;
    let sql = `SELECT r.date_recette, p.nom as patient_nom, p.prenom as patient_prenom, r.type_acte, r.montant, r.mode_paiement, s.nom as service_nom, r.description FROM recettes r LEFT JOIN patients p ON r.patient_id = p.id LEFT JOIN services s ON r.service_id = s.id WHERE 1=1`;
    const params: unknown[] = [];
    if (debut) { params.push(debut); sql += ` AND r.date_recette >= $${params.length}`; }
    if (fin) { params.push(fin); sql += ` AND r.date_recette <= $${params.length}`; }
    sql += ' ORDER BY r.date_recette DESC';
    const result = await query(sql, params);
    const csv = toCsv(['Date', 'Patient Nom', 'Patient Prénom', 'Type Acte', 'Montant', 'Mode Paiement', 'Service', 'Description'], result.rows, ['date_recette', 'patient_nom', 'patient_prenom', 'type_acte', 'montant', 'mode_paiement', 'service_nom', 'description']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=recettes.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Export depenses
router.get('/depenses', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { debut, fin } = req.query;
    let sql = 'SELECT date_depense, type_depense, nature, montant, fournisseur, description FROM depenses WHERE 1=1';
    const params: unknown[] = [];
    if (debut) { params.push(debut); sql += ` AND date_depense >= $${params.length}`; }
    if (fin) { params.push(fin); sql += ` AND date_depense <= $${params.length}`; }
    sql += ' ORDER BY date_depense DESC';
    const result = await query(sql, params);
    const csv = toCsv(['Date', 'Type', 'Nature', 'Montant', 'Fournisseur', 'Description'], result.rows, ['date_depense', 'type_depense', 'nature', 'montant', 'fournisseur', 'description']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=depenses.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Export patients
router.get('/patients', authenticate, authorize('admin', 'reception'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query("SELECT id, nom, prenom, sexe, date_naissance, telephone, email, ville, profession, nationalite FROM patients WHERE archived = FALSE ORDER BY nom");
    const csv = toCsv(['ID', 'Nom', 'Prénom', 'Sexe', 'Date Naissance', 'Téléphone', 'Email', 'Ville', 'Profession', 'Nationalité'], result.rows, ['id', 'nom', 'prenom', 'sexe', 'date_naissance', 'telephone', 'email', 'ville', 'profession', 'nationalite']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=patients.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Print patient label
router.get('/etiquette/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT id, nom, prenom, sexe, date_naissance, telephone, groupe_sanguin FROM patients WHERE id = $1', [req.params.patientId]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Patient non trouvé' }); return; }
    const p = result.rows[0];
    const age = p.date_naissance ? Math.floor((Date.now() - new Date(p.date_naissance).getTime()) / 31557600000) : '?';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Étiquette</title>
<style>@page{size:89mm 36mm;margin:0}body{font-family:'IBM Plex Sans',sans-serif;margin:0;padding:3mm;width:83mm;height:30mm;font-size:9pt;line-height:1.3}
.row{display:flex;justify-content:space-between}.name{font-size:12pt;font-weight:700}.id{font-size:8pt;color:#666}
.info{font-size:8pt;color:#333}.qr{width:24mm;height:24mm;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#999}
@media print{body{margin:0}}</style></head><body>
<div class="row"><div><div class="name">${p.prenom} ${p.nom}</div><div class="id">ID: #${p.id}</div>
<div class="info">${p.sexe === 'M' ? 'Masculin' : p.sexe === 'F' ? 'Féminin' : ''} — ${age} ans</div>
${p.telephone ? `<div class="info">Tél: ${p.telephone}</div>` : ''}
${p.groupe_sanguin ? `<div class="info">Groupe: ${p.groupe_sanguin}</div>` : ''}
<div class="info">${p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : ''}</div>
</div><div class="qr">QR<br>#${p.id}</div></div></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;