import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getTarifs, getFactures, getFacture, createPaiement, printFacture } from '../services/api';
import { useSnackbar } from '../components/Snackbar';
import PaymentModal from '../components/PaymentModal';

interface RefItem { code: string; libelle: string }
type PaymentMode = 'mobile_money' | 'carte' | 'virement' | 'especes' | 'assurance';

interface CaisseItem {
  id: number;
  entity_type: 'examen' | 'dispensation' | 'hospitalisation';
  label: string;
  montant: number | string | null;
  patient_id: number;
  patient_nom: string | null;
  patient_prenom: string | null;
  patient_telephone: string | null;
  date: string;
  entity_statut: string;
}

export default function Facturation() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'caisse' | 'factures' | 'tarifs' | 'detail'>('caisse');
  const { showSnackbar } = useSnackbar();
  const [caisseItems, setCaisseItems] = useState<CaisseItem[]>([]);
  const [tarifs, setTarifs] = useState<any[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [modesPaiement, setModesPaiement] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState<string | null>(null);
  const [paiementForm, setPaiementForm] = useState({ facture_id: 0, montant: '', mode_paiement: 'especes', reference: '' });
  // Last-payment confirmation banner. The bottom-right snackbar
  // disappears in 5 s and is easy to miss when the cashier was
  // focused on the row that just vanished from the quick-pay list.
  // This banner persists at the top of the Caisse tab until the
  // cashier dismisses it or makes another payment.
  const [lastPayment, setLastPayment] = useState<{ type: 'examen' | 'facture'; libelle: string; montant: number; mode: string; at: Date } | null>(null);
  // Modal de paiement actif (mode + examen ciblé). Remplace l'ancien
  // « 1-clic » qui marquait directement payé sans confirmation.
  const [paymentTarget, setPaymentTarget] = useState<{ examen: CaisseItem; mode: PaymentMode } | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [t, f, ci, mp] = await Promise.all([
        getTarifs(), getFactures(),
        api.get('/facturation/caisse').catch(() => ({ data: [] })),
        api.get('/reference-lists/mode_paiement').catch(() => ({ data: [] })),
      ]);
      setTarifs(t.data); setFactures(f.data);
      setCaisseItems((ci.data || []) as unknown as CaisseItem[]);
      setModesPaiement(mp.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Ouvre le modal de paiement sur le mode choisi. Plus de quickPay
  // direct : la confirmation passe par PaymentModal (Remita pour MM,
  // saisie ref pour carte/virement, monnaie à rendre pour espèces,
  // prise en charge pour assurance).
  const openPayment = (examen: CaisseItem, mode: PaymentMode) => {
    setPaymentTarget({ examen, mode });
  };

  const onPaymentSuccess = (info: { mode: string; reference?: string; montant: number; assurance?: string; co_paiement?: number }) => {
    if (!paymentTarget) return;
    const { examen } = paymentTarget;
    setCaisseItems(prev => prev.filter(p => !(p.id === examen.id && p.entity_type === examen.entity_type)));
    const modeLabel = info.assurance
      ? `Assurance ${info.assurance}${info.co_paiement ? ` (co-paiement ${info.co_paiement.toLocaleString('fr-FR')} XOF restant)` : ''}`
      : modesPaiement.find(m => m.code.toLowerCase() === info.mode.toLowerCase())?.libelle ?? info.mode;
    setLastPayment({
      type: 'examen',
      libelle: `${examen.label} — ${examen.patient_prenom ?? ''} ${examen.patient_nom ?? ''}`.trim(),
      montant: info.montant,
      mode: modeLabel,
      at: new Date(),
    });
    showSnackbar(`✓ ${examen.label} — paiement enregistré`, 'success');
    setPaymentTarget(null);
    loadAll();
  };

  const viewDetail = async (id: number) => { try { const { data } = await getFacture(id); setDetail(data); setTab('detail'); } catch { showSnackbar('Erreur', 'error'); } };

  const handlePaiement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const montant = parseFloat(paiementForm.montant);
      await createPaiement({ ...paiementForm, montant });
      const facture = factures.find(f => f.id === paiementForm.facture_id);
      const modeLabel = modesPaiement.find(m => m.code.toLowerCase() === paiementForm.mode_paiement.toLowerCase())?.libelle ?? paiementForm.mode_paiement;
      setLastPayment({
        type: 'facture',
        libelle: facture ? `Facture ${facture.numero} — ${facture.patient_prenom ?? ''} ${facture.patient_nom ?? ''}`.trim() : `Facture #${paiementForm.facture_id}`,
        montant,
        mode: modeLabel,
        at: new Date(),
      });
      showSnackbar(`✓ Paiement de ${montant.toLocaleString('fr-FR')} XOF enregistré (${modeLabel})`, 'success');
      setShowModal(null);
      viewDetail(paiementForm.facture_id);
      loadAll();
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur lors du paiement', 'error');
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(n);

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
          {tab === 'tarifs' && <button className="btn-primary" onClick={() => navigate('/app/facturation/tarifs/nouveau')}><i className="bi bi-plus"></i> Tarif</button>}
          {tab === 'factures' && <button className="btn-primary" onClick={() => navigate('/app/facturation/factures/nouvelle')}><i className="bi bi-plus"></i> Facture</button>}
        </div>
      </div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'caisse' ? 'active' : ''}`} onClick={() => setTab('caisse')}>
          Caisse {caisseItems.length > 0 && <span className="tag tag-orange" style={{ marginLeft: '0.25rem' }}>{caisseItems.length}</span>}
        </button>
        <button className={`tab-item ${tab === 'factures' ? 'active' : ''}`} onClick={() => setTab('factures')}>Factures</button>
        <button className={`tab-item ${tab === 'tarifs' ? 'active' : ''}`} onClick={() => setTab('tarifs')}>Grille tarifaire</button>
        {detail && <button className={`tab-item ${tab === 'detail' ? 'active' : ''}`} onClick={() => setTab('detail')}>Facture #{detail.numero}</button>}
      </div>

      {tab === 'caisse' && (
        <div>
          {lastPayment && (
            <div
              role="status"
              className="notification notification-success mb-2"
              style={{ alignItems: 'center', padding: '0.75rem 1rem' }}
            >
              <i className="bi bi-check-circle-fill" style={{ fontSize: '1.25rem' }}></i>
              <div style={{ flex: 1 }}>
                <strong>Paiement enregistré</strong>
                <div style={{ fontSize: '0.8125rem', marginTop: '0.125rem' }}>
                  {lastPayment.libelle} — <strong>{fmt(lastPayment.montant)}</strong> par {lastPayment.mode}
                  <span className="text-muted" style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                    {lastPayment.at.toLocaleTimeString('fr-FR')}
                  </span>
                </div>
              </div>
              <button
                className="btn-ghost btn-sm"
                onClick={() => setLastPayment(null)}
                title="Masquer"
                style={{ marginLeft: 'auto' }}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          )}
          <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>
            Paiements en attente de traitement. Les examens peuvent être encaissés directement.
          </p>
          <table className="data-table">
            <thead><tr><th>Patient</th><th>Téléphone</th><th>Type</th><th>Désignation</th><th>Date</th><th>Montant</th><th style={{ width: 1, whiteSpace: 'nowrap' }}>Encaisser</th></tr></thead>
            <tbody>
              {caisseItems.map(item => (
                <tr key={`${item.entity_type}-${item.id}`}>
                  <td className="fw-600">{item.patient_prenom} {item.patient_nom}</td>
                  <td>{item.patient_telephone || '-'}</td>
                  <td>
                    <span className={`tag ${item.entity_type === 'examen' ? 'tag-blue' : item.entity_type === 'dispensation' ? 'tag-purple' : 'tag-orange'}`}>
                      {item.entity_type === 'examen' ? 'Examen' : item.entity_type === 'dispensation' ? 'Dispensation' : 'Hospitalisation'}
                    </span>
                  </td>
                  <td>{item.label}</td>
                  <td>{new Date(item.date).toLocaleDateString('fr-FR')}</td>
                  <td className="fw-600">{item.montant ? fmt(Number(item.montant)) : '-'}</td>
                  <td>
                    {item.entity_type === 'examen' ? (
                      <div className="d-flex gap-1" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn-primary btn-sm" title="Espèces" onClick={() => openPayment(item, 'especes')}><i className="bi bi-cash"></i> Esp.</button>
                        <button className="btn-primary btn-sm" title="Mobile Money via Remita" onClick={() => openPayment(item, 'mobile_money')}><i className="bi bi-phone"></i> MM</button>
                        <button className="btn-primary btn-sm" title="Carte bancaire" onClick={() => openPayment(item, 'carte')}><i className="bi bi-credit-card"></i> Carte</button>
                        <button className="btn-secondary btn-sm" title="Prise en charge assurance" onClick={() => openPayment(item, 'assurance')}><i className="bi bi-shield-check"></i> Assur.</button>
                        <button className="btn-ghost btn-sm" title="Virement" onClick={() => openPayment(item, 'virement')}><i className="bi bi-bank"></i> Vir.</button>
                      </div>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.75rem' }} title="Facturation automatique via le flux dédié">
                        <i className="bi bi-arrow-right-circle"></i> Facturé
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {caisseItems.length === 0 && (
                <tr><td colSpan={7} className="table-empty"><i className="bi bi-cash-stack" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}></i>Aucun paiement en attente</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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

      {/* Modal Paiement */}
      {showModal === 'paiement' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouveau paiement</h3><button className="btn-icon" onClick={() => setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handlePaiement}><div className="modal-body">
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Montant *</label><input type="number" className="form-input" value={paiementForm.montant} onChange={e => setPaiementForm({...paiementForm, montant: e.target.value})} required /></div>
              <div className="form-group"><label className="form-label">Mode</label><select className="form-select" value={paiementForm.mode_paiement} onChange={e => setPaiementForm({...paiementForm, mode_paiement: e.target.value})}>{modesPaiement.map(m => <option key={m.code} value={m.code.toLowerCase()}>{m.libelle}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Référence</label><input type="text" className="form-input" value={paiementForm.reference} onChange={e => setPaiementForm({...paiementForm, reference: e.target.value})} placeholder="N° transaction, bon assurance..." /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer le paiement</button></div></form>
        </div></div>
      )}

      {/* Modal Paiement par mode (Remita / Carte / Espèces / Virement / Assurance) */}
      {paymentTarget && (
        <PaymentModal
          examenId={paymentTarget.examen.id}
          patientId={paymentTarget.examen.patient_id}
          patientName={`${paymentTarget.examen.patient_prenom ?? ''} ${paymentTarget.examen.patient_nom ?? ''}`.trim()}
          patientPhone={paymentTarget.examen.patient_telephone}
          montant={Number(paymentTarget.examen.montant ?? 0)}
          mode={paymentTarget.mode}
          onSuccess={onPaymentSuccess}
          onClose={() => setPaymentTarget(null)}
        />
      )}
    </div>
  );
}