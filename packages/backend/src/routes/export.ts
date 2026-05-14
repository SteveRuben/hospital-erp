import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// SECURITY: HTML escape to prevent XSS in generated HTML
const escapeHtml = (str: string | null | undefined): string => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

// Helper: generate CSV content
const toCsv = (headers: string[], rows: Record<string, unknown>[], keys: string[]): string => {
  const lines = [headers.join(';')];
  for (const row of rows) {
    lines.push(keys.map(k => {
      const val = String(row[k] ?? '').replace(/;/g, ',').replace(/\n/g, ' ');
      return `"${val}"`;
    }).join(';'));
  }
  return '﻿' + lines.join('\n'); // BOM for Excel
};

// Export recettes
router.get('/recettes', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { debut, fin } = req.query;
    const filters: Prisma.Sql[] = [];
    if (debut) filters.push(Prisma.sql`r.date_recette >= ${String(debut)}::date`);
    if (fin) filters.push(Prisma.sql`r.date_recette <= ${String(fin)}::date`);
    const whereClause = filters.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT r.date_recette, p.nom AS patient_nom, p.prenom AS patient_prenom,
             r.type_acte, r.montant, r.mode_paiement, s.nom AS service_nom, r.description
      FROM recettes r
      LEFT JOIN patients p ON r.patient_id = p.id
      LEFT JOIN services s ON r.service_id = s.id
      ${whereClause}
      ORDER BY r.date_recette DESC
    `;
    const csv = toCsv(
      ['Date', 'Patient Nom', 'Patient Prénom', 'Type Acte', 'Montant', 'Mode Paiement', 'Service', 'Description'],
      rows,
      ['date_recette', 'patient_nom', 'patient_prenom', 'type_acte', 'montant', 'mode_paiement', 'service_nom', 'description']
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=recettes.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Export depenses
router.get('/depenses', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { debut, fin } = req.query;
    const where: Prisma.DepenseWhereInput = {};
    if (debut || fin) {
      where.dateDepense = {};
      if (debut) (where.dateDepense as any).gte = new Date(String(debut));
      if (fin) (where.dateDepense as any).lte = new Date(String(fin));
    }
    const rows = await prisma.depense.findMany({
      where,
      orderBy: { dateDepense: 'desc' },
      select: {
        dateDepense: true,
        typeDepense: true,
        nature: true,
        montant: true,
        fournisseur: true,
        description: true,
      },
    });
    // Map back to legacy snake_case keys for CSV
    const mapped = rows.map(r => ({
      date_depense: r.dateDepense,
      type_depense: r.typeDepense,
      nature: r.nature,
      montant: r.montant,
      fournisseur: r.fournisseur,
      description: r.description,
    }));
    const csv = toCsv(
      ['Date', 'Type', 'Nature', 'Montant', 'Fournisseur', 'Description'],
      mapped,
      ['date_depense', 'type_depense', 'nature', 'montant', 'fournisseur', 'description']
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=depenses.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Export patients
router.get('/patients', authenticate, authorize('admin', 'reception'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.patient.findMany({
      where: { archived: false },
      orderBy: { nom: 'asc' },
      select: {
        id: true, nom: true, prenom: true, sexe: true, dateNaissance: true,
        telephone: true, email: true, ville: true, profession: true, nationalite: true,
      },
    });
    const mapped = rows.map(r => ({
      id: r.id,
      nom: r.nom,
      prenom: r.prenom,
      sexe: r.sexe,
      date_naissance: r.dateNaissance,
      telephone: r.telephone,
      email: r.email,
      ville: r.ville,
      profession: r.profession,
      nationalite: r.nationalite,
    }));
    const csv = toCsv(
      ['ID', 'Nom', 'Prénom', 'Sexe', 'Date Naissance', 'Téléphone', 'Email', 'Ville', 'Profession', 'Nationalité'],
      mapped,
      ['id', 'nom', 'prenom', 'sexe', 'date_naissance', 'telephone', 'email', 'ville', 'profession', 'nationalite']
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=patients.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Print patient label
router.get('/etiquette/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const p = await prisma.patient.findUnique({
      where: { id: Number(req.params.patientId) },
      select: {
        id: true, nom: true, prenom: true, sexe: true, dateNaissance: true,
        telephone: true, groupeSanguin: true,
      },
    });
    if (!p) { res.status(404).json({ error: 'Patient non trouvé' }); return; }
    const age = p.dateNaissance ? Math.floor((Date.now() - new Date(p.dateNaissance).getTime()) / 31557600000) : '?';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Étiquette</title>
<style>@page{size:89mm 36mm;margin:0}body{font-family:'IBM Plex Sans',sans-serif;margin:0;padding:3mm;width:83mm;height:30mm;font-size:9pt;line-height:1.3}
.row{display:flex;justify-content:space-between}.name{font-size:12pt;font-weight:700}.id{font-size:8pt;color:#666}
.info{font-size:8pt;color:#333}.qr{width:24mm;height:24mm;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#999}
@media print{body{margin:0}}</style></head><body>
<div class="row"><div><div class="name">${escapeHtml(p.prenom)} ${escapeHtml(p.nom)}</div><div class="id">ID: #${p.id}</div>
<div class="info">${p.sexe === 'M' ? 'Masculin' : p.sexe === 'F' ? 'Féminin' : ''} — ${age} ans</div>
${p.telephone ? `<div class="info">Tél: ${escapeHtml(p.telephone)}</div>` : ''}
${p.groupeSanguin ? `<div class="info">Groupe: ${escapeHtml(String(p.groupeSanguin))}</div>` : ''}
<div class="info">${p.dateNaissance ? new Date(p.dateNaissance).toLocaleDateString('fr-FR') : ''}</div>
</div><div class="qr">QR<br>#${p.id}</div></div></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Print patient card (CR-80 format: 85.6mm x 54mm)
router.get('/carte/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const patientId = Number(req.params.patientId);
    const p = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!p) { res.status(404).json({ error: 'Patient non trouvé' }); return; }
    const age = p.dateNaissance ? Math.floor((Date.now() - new Date(p.dateNaissance).getTime()) / 31557600000) : '?';
    const allergies = await prisma.allergie.findMany({
      where: { patientId, active: true },
      take: 3,
      select: { allergene: true },
    });
    const allergyList = allergies.map(a => escapeHtml(a.allergene)).join(', ') || 'Aucune connue';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Carte Patient</title>
<style>@page{size:85.6mm 54mm;margin:0}*{box-sizing:border-box}body{font-family:'IBM Plex Sans',sans-serif;margin:0;padding:0;font-size:8pt}
.card{width:85.6mm;height:54mm;position:relative;overflow:hidden}
.front{width:85.6mm;height:54mm;padding:3mm;background:linear-gradient(135deg,#0f62fe 0%,#001d6c 100%);color:#fff;display:flex;flex-direction:column;justify-content:space-between}
.back{width:85.6mm;height:54mm;padding:3mm;background:#fff;color:#161616;page-break-before:always}
.logo{font-size:10pt;font-weight:700;display:flex;align-items:center;gap:2mm}.logo-icon{font-size:12pt}
.patient-name{font-size:14pt;font-weight:600;margin:2mm 0}
.patient-id{font-size:9pt;opacity:0.8}
.info-row{display:flex;justify-content:space-between;font-size:7pt;opacity:0.9}
.qr{position:absolute;right:3mm;bottom:3mm;width:16mm;height:16mm;background:#fff;border-radius:2px;display:flex;align-items:center;justify-content:center;color:#000;font-size:6pt;text-align:center}
.back-title{font-size:9pt;font-weight:600;margin-bottom:2mm;color:#0f62fe;border-bottom:0.5pt solid #e0e0e0;padding-bottom:1mm}
.back-row{display:flex;justify-content:space-between;margin-bottom:1.5mm;font-size:7.5pt}
.back-label{color:#525252;font-weight:500}
.back-value{font-weight:400}
.footer{position:absolute;bottom:2mm;left:3mm;right:3mm;font-size:6pt;color:#6f6f6f;text-align:center;border-top:0.5pt solid #e0e0e0;padding-top:1mm}
@media print{body{margin:0}.card{page-break-after:always}}</style></head><body>
<div class="card front">
<div class="logo"><span class="logo-icon">🏥</span> Hospital ERP</div>
<div><div class="patient-name">${escapeHtml(p.prenom)} ${escapeHtml(p.nom)}</div><div class="patient-id">ID: #${String(p.id).padStart(6, '0')}</div></div>
<div class="info-row"><span>${p.sexe === 'M' ? 'Masculin' : p.sexe === 'F' ? 'Féminin' : ''} — ${age} ans</span><span>${escapeHtml(p.groupeSanguin ? String(p.groupeSanguin) : '')}</span></div>
<div class="qr">QR<br>#${p.id}</div>
</div>
<div class="card back">
<div class="back-title">Informations patient</div>
<div class="back-row"><span class="back-label">Téléphone</span><span class="back-value">${escapeHtml(p.telephone) || '-'}</span></div>
<div class="back-row"><span class="back-label">Date naissance</span><span class="back-value">${p.dateNaissance ? new Date(p.dateNaissance).toLocaleDateString('fr-FR') : '-'}</span></div>
<div class="back-row"><span class="back-label">Groupe sanguin</span><span class="back-value">${escapeHtml(p.groupeSanguin ? String(p.groupeSanguin) : '') || 'Non renseigné'}</span></div>
<div class="back-row"><span class="back-label">Allergies</span><span class="back-value">${allergyList}</span></div>
<div class="back-row"><span class="back-label">Contact urgence</span><span class="back-value">${escapeHtml(p.contactUrgenceNom) || '-'} ${escapeHtml(p.contactUrgenceTelephone)}</span></div>
<div class="footer">Carte émise le ${new Date().toLocaleDateString('fr-FR')} — Hospital ERP</div>
</div></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
