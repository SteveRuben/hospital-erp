import { useState, useEffect } from 'react';
import { getTarifs, createTarif, getFactures, getFacture, createFacture, createPaiement, getPatients, printFacture } from '../services/api';
import type { Patient } from '../types';

export default function Facturation() {
  const [tab, setTab] = useState<'factures' | 'tarifs' | 'detail'>('factures');
  const [tarifs, setTarifs] = useState<any[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState<string | null>(null);
  const [tarifForm, setTarifForm] = useState({ code: '', libelle: '', categorie: '', montant: '' });
  const [factureForm, setFactureForm] = useState({ patient_id: '', lignes: [{ tarif_id: '', libelle: '', quantite: 1, prix_unitaire: 0 }] as Array<{tarif_id: string; libelle: string; quantite: number; prix_unitaire: number}>, notes: '' });
  const [paiementForm, setPaiementForm] = useState({ facture_id: 0, montant: '', mode_paiement: 'especes', reference: '' });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [t, f, p] = await Promise.all([getTarifs(), getFactures(), getPatients({ archived: 'false' })]);
      setTarifs(t.data); setFactures(f.data); setPatients(p.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const viewDetail = async (id: number) => { try { const { data } = await getFacture(id); setDetail(data); setTab('detail'); } catch { alert('Erreur'); } };

  const handleTarif = async (e: React.FormEvent) => { e.preventDefault(); try { await createTarif({ ...tarifForm, montant: parseFloat(tarifForm.montant) }); setShowModal(null); setTarifForm({ code: '', libelle: '', categorie: '', montant: '' }); loadAll(); } catch (err: any) { alert(err.response?.data?.error || 'Erreur'); } };

  const handleFacture = async (e: React.FormEvent) => {
    e.preventDefault();
    const lignes = factureForm.lignes.filter(l => l.libelle && l.prix_unitaire > 0);
    if (lignes.length === 0) { alert('Ajoutez au moins une ligne'); return; }
    try { await createFacture({ patient_id: Number(factureForm.patient_id), lignes, notes: factureForm.notes }); setShowModal(null); setFactureForm({ patient_id: '', lignes: [{ tarif_id: '', libelle: '', quantite: 1, prix_unitaire: 0 }], notes: '' }); loadAll(); } catch (err: any) { alert(err.response?.data?.error || 'Erreur'); }
  };

  const handlePaiement = async (e: React.FormEvent) => { e.preventDefault(); try { await createPaiement({ ...paiementForm, montant: parseFloat(paiementForm.montant) }); setShowModal(null); viewDetail(paiementForm.facture_id); loadAll(); } catch { alert('Erreur'); } };

  const addLigne = () => setFactureForm({ ...factureForm, lignes: [...factureForm.lignes, { tarif_id: '', libelle: '', quantite: 1, prix_unitaire: 0 }] });
  const removeLigne = (i: number) => setFactureForm({ ...factureForm, lignes: factureForm.lignes.filter((_, idx) => idx !== i) });
  const updateLigne = (i: number, field: string, value: string | number) => {
    const lignes = [...factureForm.lignes];
    (lignes[i] as any)[field] = value;
    // Auto-fill from tarif
    if (field === 'tarif_id' && value) {
      const t = tarifs.find((t: any) => t.id === Number(value));
      if (t) { lignes[i].libelle = t.libelle; lignes[i].prix_unitaire = parseFloat(t.montant); }
    }
    setFactureForm({ ...factureForm, lignes });
  };

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(n);
  const totalFacture = factureForm.lignes.reduce((s, l) => s + l.prix_unitaire * l.quantite, 0);

  // Print a receipt for a specific payment
  const printRecuPaiement = (facture: any, paiement: any, numero: number) => {
    const totalPaye = facture.paiements.reduce((s: number, p: any) => s + parseFloat(p.montant), 0);
    const reste = parseFloat(facture.montant_total) - totalPaye;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reçu de paiement</title>
<style>body{font-family:'IBM Plex Sans',sans-serif;margin:2rem;color:#161616;font-size:14px}
h1{font-size:1.25rem;font-weight:300}table{width:100%;border-collapse:collapse;margin:1rem 0}
th{background:#e0e0e0;padding:0.5rem;text-align:left;font-size:0.75rem;text-transform:uppercase}
td{padding:0.5rem;border-bottom:1px solid #e0e0e0}
.header{display:flex;justify-content:space-between;border-bottom:2px solid #0f62fe;padding-bottom:1rem;margin-bottom:1rem}
.amount{font-size:1.5rem;font-weight:600;color:#0f62fe;text-align:center;margin:1.5rem 0}
.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #e0e0e0;font-size:0.75rem;color:#525252}
.badge{display:inline-block;padding:0.25rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:600}
.badge-partial{background:#fff3cd;color:#856404}
.badge-paid{background:#d4edda;color:#155724}
@media print{body{margin:0}}</style></head><body>
<div class="header"><div><h1>Hospital ERP</h1><p>Reçu de paiement N° ${numero}/${facture.paiements.length}</p><p>Facture: ${facture.numero}</p></div>
<div style="text-align:right"><p>Date: ${new Date(paiement.date_paiement).toLocaleString('fr-FR')}</p>
<p>Patient: ${facture.patient_prenom} ${facture.patient_nom}</p></div></div>
<div class="amount">${new Intl.NumberFormat('fr-FR').format(parseFloat(paiement.montant))} XOF</div>
<table><tbody>
<tr><td><strong>Mode de paiement</strong></td><td>${paiement.mode_paiement}</td></tr>
<tr><td><strong>Référence</strong></td><td>${paiement.reference || '-'}</td></tr>
<tr><td><strong>Reçu par</strong></td><td>${paiement.recu_prenom} ${paiement.recu_nom}</td></tr>
${paiement.notes ? `<tr><td><strong>Notes</strong></td><td>${paiement.notes}</td></tr>` : ''}
</tbody></table>
<table><thead><tr><th>Récapitulatif facture</th><th style="text-align:right">Montant</th></tr></thead><tbody>
<tr><td>Total facture</td><td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(parseFloat(facture.montant_total))} XOF</td></tr>
<tr><td>Total payé (${facture.paiements.length} paiement${facture.paiements.length > 1 ? 's' : ''})</td><td style="text-align:right;color:green">${new Intl.NumberFormat('fr-FR').format(totalPaye)} XOF</td></tr>
<tr><td><strong>Reste à payer</strong></td><td style="text-align:right;color:${reste > 0 ? 'red' : 'green'};font-weight:600">${new Intl.NumberFormat('fr-FR').format(reste)} XOF</td></tr>
</tbody></table>
<p style="text-align:center;margin-top:1rem"><span class="badge ${reste <= 0 ? 'badge-paid' : 'badge-partial'}">${reste <= 0 ? 'FACTURE SOLDÉE' : 'PAIEMENT PARTIEL'}</span></p>
<div class="footer"><p>Document généré automatiquement par Hospital ERP — ${new Date().toLocaleString('fr-FR')}</p></div></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const statutConfig: Record<string, { label: string; tag: string }> = { en_attente: { label: 'En attente', tag: 'tag-yellow' }, partielle: { label: 'Partielle', tag: 'tag-orange' }, payee: { label: 'Payée', tag: 'tag-green' }, annulee: { label: 'Annulée', tag: 'tag-red' } };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Facturation</span></nav>
      <div className="page-header"><h1 className="page-title">Facturation</h1>
        <div className="d-flex gap-1">
          {tab === 'tarifs' && <button className="btn-primary" onClick={() => setShowModal('tarif')}><i className="bi bi-plus"></i> Tarif</button>}
          {tab === 'factures' && <button className="btn-primary" onClick={() => setShowModal('facture')}><i className="bi bi-plus"></i> Facture</button>}
        </div>
      </div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'factures' ? 'active' : ''}`} onClick={() => setTab('factures')}>Factures</button>
        <button className={`tab-item ${tab === 'tarifs' ? 'active' : ''}`} onClick={() => setTab('tarifs')}>Grille tarifaire</button>
        {detail && <button className={`tab-item ${tab === 'detail' ? 'active' : ''}`} onClick={() => setTab('detail')}>Facture #{detail.numero}</button>}
      </div>

      {tab === 'factures' && (
        <table className="data-table"><thead><tr><th>N°</th><th>Date</th><th>Patient</th><th>Total</th><th>Payé</th><th>Reste</th><th>Statut</th><th></th></tr></thead>
          <tbody>{factures.map((f: any) => (
            <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => viewDetail(f.id)}>
              <td className="fw-600">{f.numero}</td><td>{new Date(f.date_facture).toLocaleDateString('fr-FR')}</td><td>{f.patient_prenom} {f.patient_nom}</td>
              <td>{fmt(parseFloat(f.montant_total))}</td><td className="text-success">{fmt(parseFloat(f.montant_paye))}</td><td className="text-danger">{fmt(parseFloat(f.montant_total) - parseFloat(f.montant_paye))}</td>
              <td><span className={`tag ${statutConfig[f.statut]?.tag}`}>{statutConfig[f.statut]?.label}</span></td>
              <td onClick={e => e.stopPropagation()}><button className="btn-icon" onClick={() => printFacture(f.id)} title="Imprimer"><i className="bi bi-printer"></i></button></td>
            </tr>
          ))}{factures.length === 0 && <tr><td colSpan={8} className="table-empty">Aucune facture</td></tr>}</tbody>
        </table>
      )}

      {tab === 'tarifs' && (
        <table className="data-table"><thead><tr><th>Code</th><th>Libellé</th><th>Catégorie</th><th>Montant</th></tr></thead>
          <tbody>{tarifs.map((t: any) => (
            <tr key={t.id}><td className="fw-600">{t.code}</td><td>{t.libelle}</td><td><span className="tag tag-gray">{t.categorie}</span></td><td className="fw-600">{fmt(parseFloat(t.montant))}</td></tr>
          ))}{tarifs.length === 0 && <tr><td colSpan={4} className="table-empty">Aucun tarif configuré</td></tr>}</tbody>
        </table>
      )}

      {tab === 'detail' && detail && (
        <div>
          <div className="tile mb-2" style={{ padding: '1.5rem' }}>
            <div className="d-flex justify-between align-center mb-2">
              <div><h3 style={{ fontSize: '1.125rem' }}>Facture {detail.numero}</h3><p className="text-muted">{detail.patient_prenom} {detail.patient_nom} — {new Date(detail.date_facture).toLocaleDateString('fr-FR')}</p></div>
              <div className="d-flex gap-1">
                <span className={`tag ${statutConfig[detail.statut]?.tag}`}>{statutConfig[detail.statut]?.label}</span>
                <button className="btn-ghost btn-sm" onClick={() => printFacture(detail.id)}><i className="bi bi-printer"></i> Imprimer</button>
                {detail.statut !== 'payee' && <button className="btn-primary btn-sm" onClick={() => { setPaiementForm({ facture_id: detail.id, montant: String(parseFloat(detail.montant_total) - parseFloat(detail.montant_paye)), mode_paiement: 'especes', reference: '' }); setShowModal('paiement'); }}><i className="bi bi-cash"></i> Paiement</button>}
              </div>
            </div>
            <table className="data-table"><thead><tr><th>Désignation</th><th>Qté</th><th>P.U.</th><th>Montant</th></tr></thead>
              <tbody>{detail.lignes?.map((l: any) => <tr key={l.id}><td>{l.libelle}</td><td>{l.quantite}</td><td>{fmt(parseFloat(l.prix_unitaire))}</td><td className="fw-600">{fmt(parseFloat(l.montant))}</td></tr>)}
              <tr style={{ background: 'var(--cds-ui-01)' }}><td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Total</td><td className="fw-600">{fmt(parseFloat(detail.montant_total))}</td></tr></tbody>
            </table>
          </div>
          {detail.paiements?.length > 0 && (
            <div className="tile" style={{ padding: '1.5rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>Historique des paiements ({detail.paiements.length})</h4>
              <table className="data-table"><thead><tr><th>Date</th><th>Montant</th><th>Mode</th><th>Référence</th><th>Reçu par</th><th>Notes</th><th></th></tr></thead>
                <tbody>{detail.paiements.map((p: any, idx: number) => <tr key={p.id}>
                  <td>{new Date(p.date_paiement).toLocaleString('fr-FR')}</td>
                  <td className="text-success fw-600">{fmt(parseFloat(p.montant))}</td>
                  <td><span className="tag tag-gray">{p.mode_paiement}</span></td>
                  <td style={{ fontSize: '0.75rem' }}>{p.reference || '-'}</td>
                  <td>{p.recu_prenom} {p.recu_nom}</td>
                  <td style={{ fontSize: '0.75rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.notes || ''}>{p.notes || '-'}</td>
                  <td><button className="btn-icon" title="Imprimer reçu" onClick={() => printRecuPaiement(detail, p, idx + 1)}><i className="bi bi-printer"></i></button></td>
                </tr>)}</tbody>
              </table>
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--cds-ui-01)', borderRadius: '4px' }}>
                <div className="d-flex justify-between" style={{ fontSize: '0.8125rem' }}>
                  <span>Total payé</span><span className="text-success fw-600">{fmt(detail.paiements.reduce((s: number, p: any) => s + parseFloat(p.montant), 0))}</span>
                </div>
                <div className="d-flex justify-between" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                  <span>Reste à payer</span><span className="text-danger fw-600">{fmt(parseFloat(detail.montant_total) - parseFloat(detail.montant_paye))}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Tarif */}
      {showModal === 'tarif' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouveau tarif</h3><button className="btn-icon" onClick={() => setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleTarif}><div className="modal-body">
            <div className="grid-2"><div className="form-group"><label className="form-label">Code *</label><input type="text" className="form-input" value={tarifForm.code} onChange={e => setTarifForm({...tarifForm, code: e.target.value})} required placeholder="ex: CONS-GEN" /></div>
            <div className="form-group"><label className="form-label">Montant (XOF) *</label><input type="number" className="form-input" value={tarifForm.montant} onChange={e => setTarifForm({...tarifForm, montant: e.target.value})} required /></div></div>
            <div className="form-group"><label className="form-label">Libellé *</label><input type="text" className="form-input" value={tarifForm.libelle} onChange={e => setTarifForm({...tarifForm, libelle: e.target.value})} required placeholder="ex: Consultation générale" /></div>
            <div className="form-group"><label className="form-label">Catégorie *</label><input type="text" className="form-input" value={tarifForm.categorie} onChange={e => setTarifForm({...tarifForm, categorie: e.target.value})} required placeholder="ex: Consultation, Laboratoire, Imagerie" /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Créer</button></div></form>
        </div></div>
      )}

      {/* Modal Facture */}
      {showModal === 'facture' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal-container modal-lg" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouvelle facture</h3><button className="btn-icon" onClick={() => setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleFacture}><div className="modal-body">
            <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={factureForm.patient_id} onChange={e => setFactureForm({...factureForm, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '1rem 0 0.5rem' }}>Lignes de facturation</h4>
            {factureForm.lignes.map((l, i) => (
              <div key={i} className="d-flex gap-1 align-center mb-1">
                <select className="form-select" style={{ width: '200px' }} value={l.tarif_id} onChange={e => updateLigne(i, 'tarif_id', e.target.value)}><option value="">Tarif (optionnel)</option>{tarifs.map((t: any) => <option key={t.id} value={t.id}>{t.code} - {t.libelle}</option>)}</select>
                <input type="text" className="form-input" style={{ flex: 1 }} value={l.libelle} onChange={e => updateLigne(i, 'libelle', e.target.value)} placeholder="Désignation" />
                <input type="number" className="form-input" style={{ width: '60px' }} value={l.quantite} onChange={e => updateLigne(i, 'quantite', parseInt(e.target.value) || 1)} min={1} />
                <input type="number" className="form-input" style={{ width: '120px' }} value={l.prix_unitaire} onChange={e => updateLigne(i, 'prix_unitaire', parseFloat(e.target.value) || 0)} placeholder="Prix" />
                <span style={{ width: '100px', textAlign: 'right', fontWeight: 600 }}>{fmt(l.prix_unitaire * l.quantite)}</span>
                {factureForm.lignes.length > 1 && <button type="button" className="btn-icon" onClick={() => removeLigne(i)}><i className="bi bi-x"></i></button>}
              </div>
            ))}
            <button type="button" className="btn-ghost btn-sm" onClick={addLigne}><i className="bi bi-plus"></i> Ajouter une ligne</button>
            <div style={{ textAlign: 'right', marginTop: '1rem', fontSize: '1.25rem', fontWeight: 600 }}>Total: {fmt(totalFacture)}</div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Créer la facture</button></div></form>
        </div></div>
      )}

      {/* Modal Paiement */}
      {showModal === 'paiement' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouveau paiement</h3><button className="btn-icon" onClick={() => setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handlePaiement}><div className="modal-body">
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Montant *</label><input type="number" className="form-input" value={paiementForm.montant} onChange={e => setPaiementForm({...paiementForm, montant: e.target.value})} required /></div>
              <div className="form-group"><label className="form-label">Mode</label><select className="form-select" value={paiementForm.mode_paiement} onChange={e => setPaiementForm({...paiementForm, mode_paiement: e.target.value})}><option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option><option value="carte">Carte</option><option value="virement">Virement</option><option value="assurance">Assurance</option></select></div>
            </div>
            <div className="form-group"><label className="form-label">Référence</label><input type="text" className="form-input" value={paiementForm.reference} onChange={e => setPaiementForm({...paiementForm, reference: e.target.value})} placeholder="N° transaction, bon assurance..." /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer le paiement</button></div></form>
        </div></div>
      )}
    </div>
  );
}