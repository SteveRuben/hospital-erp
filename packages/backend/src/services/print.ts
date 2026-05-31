// Print service — generates HTML templates for printing
// Frontend handles printing via window.print() (no server-side PDF needed)
//
// All templates pull the establishment branding/coordonnées/legal settings
// at render time via loadEstablishment(), so the per-tenant identity flows
// through every printed document without each route having to know.

import { prisma } from '../config/db.js';

// SECURITY: HTML escape to prevent XSS. The fields we render — patient
// names, prescription text, custom header/footer textareas — are all
// user-supplied, so every interpolation MUST pass through escapeHtml.
const escapeHtml = (str: string | null | undefined): string => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

// Renders a free-text setting (e.g. pied_facture) preserving line breaks
// while still being XSS-safe. `\n` → `<br>` after escape.
const renderMultiline = (str: string | null | undefined): string =>
  escapeHtml(str).replace(/\n/g, '<br>');

export interface Establishment {
  nom: string;
  logoUrl: string | null;
  theme: string;
  adresse: string;
  ville: string;
  pays: string;
  telephone: string;
  email: string;
  numeroAgrement: string;
  directeur: string;
  devise: string;
  enteteFacture: string;
  piedFacture: string;
  enteteOrdonnance: string;
  piedOrdonnance: string;
  enteteLabo: string;
  piedLabo: string;
}

const THEME_ACCENTS: Record<string, string> = {
  'cds-blue': '#0f62fe',
  'medical-green': '#198038',
  'royal-purple': '#8a3ffc',
  'coral': '#fa4d56',
  'teal': '#1192e8',
  'slate': '#525252',
};

/**
 * Loads all establishment settings in a single query so templates can render
 * without N+1 lookups. Missing keys fall back to sensible defaults so a
 * freshly-seeded tenant still produces a printable document.
 */
export async function loadEstablishment(): Promise<Establishment> {
  const rows = await prisma.setting.findMany({
    where: { cle: { in: [
      'nom_etablissement', 'logo_url', 'theme',
      'adresse_etablissement', 'ville_etablissement', 'pays_etablissement',
      'telephone_etablissement', 'email_etablissement',
      'numero_agrement', 'directeur_etablissement',
      'devise',
      'entete_facture', 'pied_facture',
      'entete_ordonnance', 'pied_ordonnance',
      'entete_labo', 'pied_labo',
    ] } },
    select: { cle: true, valeur: true },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.cle] = r.valeur;
  return {
    nom: map.nom_etablissement || 'Hospital ERP',
    logoUrl: map.logo_url || null,
    theme: map.theme || 'cds-blue',
    adresse: map.adresse_etablissement || '',
    ville: map.ville_etablissement || '',
    pays: map.pays_etablissement || '',
    telephone: map.telephone_etablissement || '',
    email: map.email_etablissement || '',
    numeroAgrement: map.numero_agrement || '',
    directeur: map.directeur_etablissement || '',
    devise: map.devise || 'XOF',
    enteteFacture: map.entete_facture || '',
    piedFacture: map.pied_facture || '',
    enteteOrdonnance: map.entete_ordonnance || '',
    piedOrdonnance: map.pied_ordonnance || '',
    enteteLabo: map.entete_labo || '',
    piedLabo: map.pied_labo || '',
  };
}

// Resolves to an absolute logo URL the browser will fetch when the print
// preview opens. The DB stores `/uploads/branding/logo.png` (relative);
// `serverOrigin` (e.g. https://hospital.example.com) is prepended so the
// printed HTML works when opened/saved outside the app.
function logoSrc(logoUrl: string | null, serverOrigin: string): string | null {
  if (!logoUrl) return null;
  if (/^https?:\/\//.test(logoUrl)) return logoUrl;
  return serverOrigin.replace(/\/$/, '') + logoUrl;
}

/**
 * Standard establishment header used at the top of every printed document.
 * Logo (if present) on the left, name + address + contact on the right,
 * separated by an accent-colored rule.
 */
function renderHeader(est: Establishment, serverOrigin: string, customHeader: string, accent: string): string {
  if (customHeader) {
    return `<div class="header" style="border-bottom:2px solid ${accent};padding-bottom:1rem;margin-bottom:1rem">${renderMultiline(customHeader)}</div>`;
  }

  const logo = logoSrc(est.logoUrl, serverOrigin);
  const contactLines: string[] = [];
  if (est.adresse) contactLines.push(escapeHtml(est.adresse));
  const villePays = [est.ville, est.pays].filter(Boolean).map(escapeHtml).join(', ');
  if (villePays) contactLines.push(villePays);
  if (est.telephone) contactLines.push(`Tél: ${escapeHtml(est.telephone)}`);
  if (est.email) contactLines.push(`Email: ${escapeHtml(est.email)}`);
  if (est.numeroAgrement) contactLines.push(`N° d'agrément: ${escapeHtml(est.numeroAgrement)}`);

  return `<div class="header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${accent};padding-bottom:1rem;margin-bottom:1rem;gap:1rem">
    <div style="display:flex;align-items:center;gap:1rem">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" style="height:64px;width:auto;max-width:180px;object-fit:contain">` : ''}
      <div>
        <h1 style="font-size:1.25rem;font-weight:600;margin:0">${escapeHtml(est.nom)}</h1>
        ${contactLines.length ? `<p style="font-size:0.75rem;color:#525252;margin:0.25rem 0 0;line-height:1.4">${contactLines.join('<br>')}</p>` : ''}
      </div>
    </div>
  </div>`;
}

/**
 * Standard footer — director name and a per-document free-text mention
 * (e.g. invoice payment conditions). Empty if both are blank.
 */
function renderFooter(est: Establishment, customFooter: string): string {
  const parts: string[] = [];
  if (customFooter) parts.push(renderMultiline(customFooter));
  if (est.directeur) parts.push(`Directeur médical : ${escapeHtml(est.directeur)}`);
  if (!parts.length) return '';
  return `<div class="footer" style="margin-top:2rem;padding-top:1rem;border-top:1px solid #e0e0e0;font-size:0.75rem;color:#525252">${parts.join('<br>')}</div>`;
}

const SHARED_STYLE = `body{font-family:'IBM Plex Sans',sans-serif;margin:2rem;color:#161616;font-size:14px}
h1{font-size:1.5rem;font-weight:300;margin:0}h2{font-size:1.125rem;font-weight:500;margin:1rem 0 0.5rem}
table{width:100%;border-collapse:collapse;margin:1rem 0}
th{background:#e0e0e0;padding:0.5rem;text-align:left;font-size:0.75rem;text-transform:uppercase}
td{padding:0.5rem;border-bottom:1px solid #e0e0e0}.total{font-size:1.25rem;font-weight:600}
.signature{margin-top:3rem;text-align:right}
@media print{body{margin:0}}`;

function accentFor(theme: string): string {
  return THEME_ACCENTS[theme] || THEME_ACCENTS['cds-blue'];
}

export const generateFactureHtml = (
  facture: {
    numero: string; date_facture: string; patient_nom: string; patient_prenom: string;
    patient_telephone?: string; montant_total: number; montant_paye: number;
    lignes: Array<{ libelle: string; quantite: number; prix_unitaire: number; montant: number }>;
    paiements: Array<{ montant: number; mode_paiement: string; date_paiement: string }>;
  },
  est: Establishment,
  serverOrigin = '',
): string => {
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
  const accent = accentFor(est.theme);
  const lignesHtml = facture.lignes.map(l => `<tr><td>${escapeHtml(l.libelle)}</td><td style="text-align:center">${l.quantite}</td><td style="text-align:right">${fmt(l.prix_unitaire)}</td><td style="text-align:right">${fmt(l.montant)}</td></tr>`).join('');
  const paiementsHtml = facture.paiements.map(p => `<tr><td>${new Date(p.date_paiement).toLocaleDateString('fr-FR')}</td><td>${escapeHtml(p.mode_paiement)}</td><td style="text-align:right">${fmt(p.montant)}</td></tr>`).join('');
  const dev = escapeHtml(est.devise);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture ${escapeHtml(facture.numero)}</title>
<style>${SHARED_STYLE}</style></head><body>
${renderHeader(est, serverOrigin, est.enteteFacture, accent)}
<div style="display:flex;justify-content:space-between;margin-bottom:1rem">
  <div>
    <h2 style="margin:0">Facture N° ${escapeHtml(facture.numero)}</h2>
    <p style="margin:0.25rem 0 0;font-size:0.875rem">Date : ${new Date(facture.date_facture).toLocaleDateString('fr-FR')}</p>
  </div>
  <div style="text-align:right">
    <p style="margin:0;font-size:0.75rem;color:#525252">Patient</p>
    <p style="margin:0;font-weight:600">${escapeHtml(facture.patient_prenom)} ${escapeHtml(facture.patient_nom)}</p>
    ${facture.patient_telephone ? `<p style="margin:0;font-size:0.875rem">Tél: ${escapeHtml(facture.patient_telephone)}</p>` : ''}
  </div>
</div>
<table><thead><tr><th>Désignation</th><th style="text-align:center">Qté</th><th style="text-align:right">P.U. (${dev})</th><th style="text-align:right">Montant (${dev})</th></tr></thead>
<tbody>${lignesHtml}</tbody>
<tfoot><tr><td colspan="3" style="text-align:right;font-weight:600">Total</td><td style="text-align:right" class="total">${fmt(facture.montant_total)} ${dev}</td></tr></tfoot></table>
${facture.paiements.length > 0 ? `<h2>Paiements</h2><table><thead><tr><th>Date</th><th>Mode</th><th style="text-align:right">Montant (${dev})</th></tr></thead><tbody>${paiementsHtml}</tbody></table>` : ''}
<p><strong>Reste à payer : ${fmt(facture.montant_total - facture.montant_paye)} ${dev}</strong></p>
${renderFooter(est, est.piedFacture)}
</body></html>`;
};

export const generateOrdonnanceHtml = (
  data: {
    patient_nom: string; patient_prenom: string; medecin_nom: string; medecin_prenom: string;
    date: string; prescriptions: Array<{ medicament: string; dosage?: string; frequence?: string; duree?: string; voie?: string; instructions?: string }>;
  },
  est: Establishment,
  serverOrigin = '',
): string => {
  const accent = accentFor(est.theme);
  const presHtml = data.prescriptions.map((p, i) => `<tr><td>${i + 1}</td><td><strong>${escapeHtml(p.medicament)}</strong>${p.dosage ? ` — ${escapeHtml(p.dosage)}` : ''}${p.frequence ? ` — ${escapeHtml(p.frequence)}` : ''}${p.duree ? ` — ${escapeHtml(p.duree)}` : ''}${p.voie ? ` (${escapeHtml(p.voie)})` : ''}${p.instructions ? `<br><em>${escapeHtml(p.instructions)}</em>` : ''}</td></tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ordonnance</title>
<style>${SHARED_STYLE}</style></head><body>
${renderHeader(est, serverOrigin, est.enteteOrdonnance, accent)}
<h2>Ordonnance médicale</h2>
<p style="font-size:0.875rem;margin-bottom:1rem">Date : ${new Date(data.date).toLocaleDateString('fr-FR')}<br>
Patient : <strong>${escapeHtml(data.patient_prenom)} ${escapeHtml(data.patient_nom)}</strong><br>
Médecin : Dr. ${escapeHtml(data.medecin_prenom)} ${escapeHtml(data.medecin_nom)}</p>
<table><thead><tr><th>#</th><th>Prescription</th></tr></thead><tbody>${presHtml}</tbody></table>
<div class="signature"><p>Signature du médecin</p><br><br><p>_________________________</p><p>Dr. ${escapeHtml(data.medecin_prenom)} ${escapeHtml(data.medecin_nom)}</p></div>
${renderFooter(est, est.piedOrdonnance)}
</body></html>`;
};

export const generateResultatLaboHtml = (
  data: {
    patient_nom: string; patient_prenom: string; date: string;
    examens: Array<{ type_examen: string; resultat?: string; date_examen: string }>;
  },
  est: Establishment,
  serverOrigin = '',
): string => {
  const accent = accentFor(est.theme);
  const exHtml = data.examens.map(e => `<tr><td>${escapeHtml(e.type_examen)}</td><td>${escapeHtml(e.resultat) || 'En attente'}</td><td>${new Date(e.date_examen).toLocaleDateString('fr-FR')}</td></tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Résultats Laboratoire</title>
<style>${SHARED_STYLE}</style></head><body>
${renderHeader(est, serverOrigin, est.enteteLabo, accent)}
<h2>Résultats de Laboratoire</h2>
<p style="font-size:0.875rem;margin-bottom:1rem">Patient : <strong>${escapeHtml(data.patient_prenom)} ${escapeHtml(data.patient_nom)}</strong><br>
Date : ${new Date(data.date).toLocaleDateString('fr-FR')}</p>
<table><thead><tr><th>Examen</th><th>Résultat</th><th>Date</th></tr></thead><tbody>${exHtml}</tbody></table>
${renderFooter(est, est.piedLabo)}
</body></html>`;
};

/**
 * Résumé de sortie d'hospitalisation — given to the patient (or
 * carried in their dossier) at discharge. Includes admission info,
 * diagnostic, traitement, conseils, and the active prescription set.
 * Most jurisdictions require a written discharge summary; this is
 * the standard form.
 */
export const generateResumeSortieHtml = (
  data: {
    patient_nom: string; patient_prenom: string;
    date_admission: string; date_sortie: string;
    motif: string | null; statut_sortie: string;
    medecin_nom: string; medecin_prenom: string; medecin_specialite: string | null;
    service_nom: string | null;
    diagnostic: string | null;
    traitement_recu: string | null;
    consignes: string | null;
    prescriptions: Array<{ medicament: string; dosage?: string | null; frequence?: string | null; duree?: string | null }>;
    rdv_suivi: string | null;
  },
  est: Establishment,
  serverOrigin = '',
): string => {
  const accent = accentFor(est.theme);
  const dureeJours = Math.max(1, Math.round((new Date(data.date_sortie).getTime() - new Date(data.date_admission).getTime()) / 86_400_000));
  const presHtml = data.prescriptions.length === 0 ? '<p class="text-muted">Aucune ordonnance de sortie.</p>' :
    `<table><thead><tr><th>Médicament</th><th>Dosage</th><th>Fréquence</th><th>Durée</th></tr></thead><tbody>` +
    data.prescriptions.map(p => `<tr><td><strong>${escapeHtml(p.medicament)}</strong></td><td>${escapeHtml(p.dosage ?? '')}</td><td>${escapeHtml(p.frequence ?? '')}</td><td>${escapeHtml(p.duree ?? '')}</td></tr>`).join('') +
    `</tbody></table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Résumé de sortie</title>
<style>${SHARED_STYLE}</style></head><body>
${renderHeader(est, serverOrigin, est.enteteOrdonnance ?? '', accent)}
<h2>Résumé de sortie d'hospitalisation</h2>
<table style="margin-bottom:1rem"><tbody>
  <tr><td><strong>Patient</strong></td><td>${escapeHtml(data.patient_prenom)} ${escapeHtml(data.patient_nom)}</td></tr>
  <tr><td><strong>Service</strong></td><td>${escapeHtml(data.service_nom ?? '—')}</td></tr>
  <tr><td><strong>Admission</strong></td><td>${new Date(data.date_admission).toLocaleDateString('fr-FR')}</td></tr>
  <tr><td><strong>Sortie</strong></td><td>${new Date(data.date_sortie).toLocaleDateString('fr-FR')} (${escapeHtml(data.statut_sortie)})</td></tr>
  <tr><td><strong>Durée</strong></td><td>${dureeJours} jour${dureeJours > 1 ? 's' : ''}</td></tr>
  <tr><td><strong>Médecin référent</strong></td><td>Dr. ${escapeHtml(data.medecin_prenom)} ${escapeHtml(data.medecin_nom)}${data.medecin_specialite ? ` (${escapeHtml(data.medecin_specialite)})` : ''}</td></tr>
</tbody></table>

<h3>Motif d'admission</h3>
<p>${escapeHtml(data.motif ?? '—')}</p>

<h3>Diagnostic principal</h3>
<p>${escapeHtml(data.diagnostic ?? '—')}</p>

<h3>Traitement reçu pendant l'hospitalisation</h3>
<p>${escapeHtml(data.traitement_recu ?? '—')}</p>

<h3>Ordonnance de sortie</h3>
${presHtml}

<h3>Consignes au patient</h3>
<p>${escapeHtml(data.consignes ?? '—')}</p>

${data.rdv_suivi ? `<h3>Rendez-vous de contrôle</h3><p>${escapeHtml(data.rdv_suivi)}</p>` : ''}

<div class="signature" style="margin-top:2rem"><p>Signature du médecin</p><br><br><p>_________________________</p><p>Dr. ${escapeHtml(data.medecin_prenom)} ${escapeHtml(data.medecin_nom)}</p></div>
${renderFooter(est, est.piedOrdonnance ?? '')}
</body></html>`;
};

/**
 * Fiche de transmission inter-équipes (shift handoff). Imprimée par
 * le médecin sortant pour le médecin entrant — situation actuelle du
 * patient + ce qui a été fait + à surveiller. Format dense, une page.
 */
export const generateFicheTransmissionHtml = (
  data: {
    patient_nom: string; patient_prenom: string; patient_id: number;
    age: number | null; sexe: string | null;
    date_etablissement: string;
    medecin_emetteur_nom: string; medecin_emetteur_prenom: string;
    motif_actuel: string | null;
    antecedents: string;
    constantes: string;
    traitements_en_cours: string;
    a_surveiller: string;
    examens_attente: string;
  },
  est: Establishment,
  serverOrigin = '',
): string => {
  const accent = accentFor(est.theme);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fiche de transmission</title>
<style>${SHARED_STYLE}
.transmission-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.5rem; }
.transmission-grid h4 { margin: 0 0 0.25rem 0; font-size: 0.8125rem; text-transform: uppercase; color: ${accent}; }
.transmission-grid p { margin: 0; font-size: 0.8125rem; }
</style></head><body>
${renderHeader(est, serverOrigin, est.enteteOrdonnance ?? '', accent)}
<h2>Fiche de transmission</h2>
<p style="font-size:0.875rem;margin-bottom:0.75rem">
  <strong>${escapeHtml(data.patient_prenom)} ${escapeHtml(data.patient_nom)}</strong> (#${data.patient_id})
  ${data.age !== null ? ` — ${data.age} ans` : ''}${data.sexe ? ` — ${escapeHtml(data.sexe)}` : ''}<br>
  Établie le ${new Date(data.date_etablissement).toLocaleString('fr-FR')} par
  Dr. ${escapeHtml(data.medecin_emetteur_prenom)} ${escapeHtml(data.medecin_emetteur_nom)}
</p>

<div class="transmission-grid">
  <div><h4>Motif actuel</h4><p>${escapeHtml(data.motif_actuel ?? '—')}</p></div>
  <div><h4>Antécédents pertinents</h4><p>${escapeHtml(data.antecedents)}</p></div>
  <div><h4>Constantes récentes</h4><p>${escapeHtml(data.constantes)}</p></div>
  <div><h4>Traitements en cours</h4><p>${escapeHtml(data.traitements_en_cours)}</p></div>
  <div><h4>À surveiller</h4><p>${escapeHtml(data.a_surveiller)}</p></div>
  <div><h4>Examens en attente</h4><p>${escapeHtml(data.examens_attente)}</p></div>
</div>

<div class="signature" style="margin-top:1.5rem"><p>Médecin entrant — émargement</p><br><br><p>_________________________</p></div>
${renderFooter(est, est.piedOrdonnance ?? '')}
</body></html>`;
};
