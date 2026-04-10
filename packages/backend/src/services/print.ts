// Print service — generates HTML templates for printing
// In production, use puppeteer for PDF generation
// For now, returns HTML that the frontend can print via window.print()

export const generateFactureHtml = (facture: {
  numero: string; date_facture: string; patient_nom: string; patient_prenom: string;
  patient_telephone?: string; montant_total: number; montant_paye: number;
  lignes: Array<{ libelle: string; quantite: number; prix_unitaire: number; montant: number }>;
  paiements: Array<{ montant: number; mode_paiement: string; date_paiement: string }>;
}): string => {
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
  const lignesHtml = facture.lignes.map(l => `<tr><td>${l.libelle}</td><td style="text-align:center">${l.quantite}</td><td style="text-align:right">${fmt(l.prix_unitaire)}</td><td style="text-align:right">${fmt(l.montant)}</td></tr>`).join('');
  const paiementsHtml = facture.paiements.map(p => `<tr><td>${new Date(p.date_paiement).toLocaleDateString('fr-FR')}</td><td>${p.mode_paiement}</td><td style="text-align:right">${fmt(p.montant)}</td></tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture ${facture.numero}</title>
<style>body{font-family:'IBM Plex Sans',sans-serif;margin:2rem;color:#161616;font-size:14px}
h1{font-size:1.5rem;font-weight:300}table{width:100%;border-collapse:collapse;margin:1rem 0}
th{background:#e0e0e0;padding:0.5rem;text-align:left;font-size:0.75rem;text-transform:uppercase}
td{padding:0.5rem;border-bottom:1px solid #e0e0e0}.total{font-size:1.25rem;font-weight:600}
.header{display:flex;justify-content:space-between;border-bottom:2px solid #0f62fe;padding-bottom:1rem;margin-bottom:1rem}
.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #e0e0e0;font-size:0.75rem;color:#525252}
@media print{body{margin:0}}</style></head><body>
<div class="header"><div><h1>Hospital ERP</h1><p>Facture N° ${facture.numero}</p></div>
<div style="text-align:right"><p>Date: ${new Date(facture.date_facture).toLocaleDateString('fr-FR')}</p>
<p>Patient: ${facture.patient_prenom} ${facture.patient_nom}</p>
${facture.patient_telephone ? `<p>Tél: ${facture.patient_telephone}</p>` : ''}</div></div>
<table><thead><tr><th>Désignation</th><th style="text-align:center">Qté</th><th style="text-align:right">P.U. (XOF)</th><th style="text-align:right">Montant (XOF)</th></tr></thead>
<tbody>${lignesHtml}</tbody>
<tfoot><tr><td colspan="3" style="text-align:right;font-weight:600">Total</td><td style="text-align:right" class="total">${fmt(facture.montant_total)} XOF</td></tr></tfoot></table>
${facture.paiements.length > 0 ? `<h3>Paiements</h3><table><thead><tr><th>Date</th><th>Mode</th><th style="text-align:right">Montant (XOF)</th></tr></thead><tbody>${paiementsHtml}</tbody></table>` : ''}
<p><strong>Reste à payer: ${fmt(facture.montant_total - facture.montant_paye)} XOF</strong></p>
<div class="footer"><p>Document généré automatiquement par Hospital ERP</p></div></body></html>`;
};

export const generateOrdonnanceHtml = (data: {
  patient_nom: string; patient_prenom: string; medecin_nom: string; medecin_prenom: string;
  date: string; prescriptions: Array<{ medicament: string; dosage?: string; frequence?: string; duree?: string; voie?: string; instructions?: string }>;
}): string => {
  const presHtml = data.prescriptions.map((p, i) => `<tr><td>${i + 1}</td><td><strong>${p.medicament}</strong>${p.dosage ? ` — ${p.dosage}` : ''}${p.frequence ? ` — ${p.frequence}` : ''}${p.duree ? ` — ${p.duree}` : ''}${p.voie ? ` (${p.voie})` : ''}${p.instructions ? `<br><em>${p.instructions}</em>` : ''}</td></tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ordonnance</title>
<style>body{font-family:'IBM Plex Sans',sans-serif;margin:2rem;color:#161616;font-size:14px}
h1{font-size:1.5rem;font-weight:300}table{width:100%;border-collapse:collapse;margin:1rem 0}
th{background:#e0e0e0;padding:0.5rem;text-align:left;font-size:0.75rem;text-transform:uppercase}
td{padding:0.75rem;border-bottom:1px solid #e0e0e0}
.header{border-bottom:2px solid #0f62fe;padding-bottom:1rem;margin-bottom:1rem}
.signature{margin-top:3rem;text-align:right}
@media print{body{margin:0}}</style></head><body>
<div class="header"><h1>Hospital ERP — Ordonnance médicale</h1>
<p>Date: ${new Date(data.date).toLocaleDateString('fr-FR')}</p>
<p>Patient: ${data.patient_prenom} ${data.patient_nom}</p>
<p>Médecin: Dr. ${data.medecin_prenom} ${data.medecin_nom}</p></div>
<table><thead><tr><th>#</th><th>Prescription</th></tr></thead><tbody>${presHtml}</tbody></table>
<div class="signature"><p>Signature du médecin</p><br><br><p>_________________________</p><p>Dr. ${data.medecin_prenom} ${data.medecin_nom}</p></div></body></html>`;
};

export const generateResultatLaboHtml = (data: {
  patient_nom: string; patient_prenom: string; date: string;
  examens: Array<{ type_examen: string; resultat?: string; date_examen: string }>;
}): string => {
  const exHtml = data.examens.map(e => `<tr><td>${e.type_examen}</td><td>${e.resultat || 'En attente'}</td><td>${new Date(e.date_examen).toLocaleDateString('fr-FR')}</td></tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Résultats Laboratoire</title>
<style>body{font-family:'IBM Plex Sans',sans-serif;margin:2rem;color:#161616;font-size:14px}
h1{font-size:1.5rem;font-weight:300}table{width:100%;border-collapse:collapse;margin:1rem 0}
th{background:#e0e0e0;padding:0.5rem;text-align:left;font-size:0.75rem;text-transform:uppercase}
td{padding:0.5rem;border-bottom:1px solid #e0e0e0}
.header{border-bottom:2px solid #0f62fe;padding-bottom:1rem;margin-bottom:1rem}
@media print{body{margin:0}}</style></head><body>
<div class="header"><h1>Hospital ERP — Résultats de Laboratoire</h1>
<p>Patient: ${data.patient_prenom} ${data.patient_nom}</p>
<p>Date: ${new Date(data.date).toLocaleDateString('fr-FR')}</p></div>
<table><thead><tr><th>Examen</th><th>Résultat</th><th>Date</th></tr></thead><tbody>${exHtml}</tbody></table>
</body></html>`;
};