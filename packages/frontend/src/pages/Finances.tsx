import { useState, useEffect } from 'react';
import { getRecettes, createRecette, deleteRecette, getDepenses, createDepense, deleteDepense, getCaisse, getBilan, getPatients, getServices } from '../services/api';
import type { Recette, Depense, Patient, Service, Bilan } from '../types';

const typeActes = ['Consultation', 'Examen', 'Hospitalisation', 'Soins', 'Médicaments', 'Chirurgie', 'Accouchement', 'Soins dentaires'];
const typeDepenses = ['Achat médicaments', 'Consommables médicaux', 'Salaires', 'Factures (eau, électricité)', 'Loyer', 'Prestataires'];

export default function Finances() {
  const [tab, setTab] = useState<'recettes' | 'depenses' | 'bilan'>('recettes');
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [caisse, setCaisse] = useState<{ recettes: number; depenses: number; solde: number } | null>(null);
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [recForm, setRecForm] = useState({ patient_id: '', service_id: '', type_acte: '', montant: '', mode_paiement: 'especes', description: '' });
  const [depForm, setDepForm] = useState({ type_depense: '', nature: '', montant: '', fournisseur: '', description: '', date_depense: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [r, d, c, p, s] = await Promise.all([getRecettes(), getDepenses(), getCaisse(), getPatients({ archived: 'false' }), getServices()]);
      setRecettes(r.data); setDepenses(d.data); setCaisse(c.data); setPatients(p.data.data); setServices(s.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadBilan = async () => { try { const { data } = await getBilan(); setBilan(data); } catch (err) { console.error(err); } };

  const handleRecette = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await createRecette(recForm); setShowModal(false); setRecForm({ patient_id: '', service_id: '', type_acte: '', montant: '', mode_paiement: 'especes', description: '' }); loadData(); } catch { alert('Erreur'); }
  };

  const handleDepense = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await createDepense(depForm); setShowModal(false); setDepForm({ type_depense: '', nature: '', montant: '', fournisseur: '', description: '', date_depense: '' }); loadData(); } catch { alert('Erreur'); }
  };

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(n);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Finances</span></nav>
      <div className="page-header"><h1 className="page-title">Finances</h1><button className="btn-primary" onClick={() => setShowModal(true)}><i className="bi bi-plus"></i> {tab === 'depenses' ? 'Nouvelle dépense' : 'Nouvelle recette'}</button></div>

      {caisse && (
        <div className="grid-3 mb-3">
          <div className="tile stat-tile"><div className="stat-value text-success">{fmt(caisse.recettes)}</div><div className="stat-label">Recettes du jour (espèces)</div></div>
          <div className="tile stat-tile"><div className="stat-value text-danger">{fmt(caisse.depenses)}</div><div className="stat-label">Dépenses du jour</div></div>
          <div className="tile stat-tile"><div className={`stat-value ${caisse.solde >= 0 ? 'text-success' : 'text-danger'}`}>{fmt(caisse.solde)}</div><div className="stat-label">Solde caisse</div></div>
        </div>
      )}

      <div className="tabs">
        <button className={`tab-item ${tab === 'recettes' ? 'active' : ''}`} onClick={() => setTab('recettes')}>Recettes</button>
        <button className={`tab-item ${tab === 'depenses' ? 'active' : ''}`} onClick={() => setTab('depenses')}>Dépenses</button>
        <button className={`tab-item ${tab === 'bilan' ? 'active' : ''}`} onClick={() => { setTab('bilan'); loadBilan(); }}>Bilan mensuel</button>
      </div>

      {tab === 'recettes' && (
        <table className="data-table"><thead><tr><th>Date</th><th>Patient</th><th>Type</th><th>Montant</th><th>Paiement</th><th></th></tr></thead>
          <tbody>
            {recettes.map(r => <tr key={r.id}><td>{new Date(r.date_recette).toLocaleDateString('fr-FR')}</td><td>{r.patient_prenom} {r.patient_nom}</td><td>{r.type_acte}</td><td className="text-success fw-600">{fmt(r.montant)}</td><td><span className="tag tag-gray">{r.mode_paiement}</span></td><td><button className="btn-icon" onClick={async () => { if (confirm('Supprimer ?')) { await deleteRecette(r.id); loadData(); }}}><i className="bi bi-trash"></i></button></td></tr>)}
            {recettes.length === 0 && <tr><td colSpan={6} className="table-empty"><i className="bi bi-cash-coin"></i>Aucune recette</td></tr>}
          </tbody>
        </table>
      )}

      {tab === 'depenses' && (
        <table className="data-table"><thead><tr><th>Date</th><th>Type</th><th>Nature</th><th>Fournisseur</th><th>Montant</th><th></th></tr></thead>
          <tbody>
            {depenses.map(d => <tr key={d.id}><td>{new Date(d.date_depense).toLocaleDateString('fr-FR')}</td><td>{d.type_depense}</td><td>{d.nature}</td><td>{d.fournisseur}</td><td className="text-danger fw-600">{fmt(d.montant)}</td><td><button className="btn-icon" onClick={async () => { if (confirm('Supprimer ?')) { await deleteDepense(d.id); loadData(); }}}><i className="bi bi-trash"></i></button></td></tr>)}
            {depenses.length === 0 && <tr><td colSpan={6} className="table-empty"><i className="bi bi-wallet2"></i>Aucune dépense</td></tr>}
          </tbody>
        </table>
      )}

      {tab === 'bilan' && bilan && (
        <div className="grid-3">
          <div className="tile stat-tile"><div className="stat-value text-success">{fmt(bilan.totalRecettes)}</div><div className="stat-label">Total Recettes</div></div>
          <div className="tile stat-tile"><div className="stat-value text-danger">{fmt(bilan.totalDepenses)}</div><div className="stat-label">Total Dépenses</div></div>
          <div className="tile stat-tile"><div className={`stat-value ${bilan.resultatNet >= 0 ? 'text-success' : 'text-danger'}`}>{fmt(bilan.resultatNet)}</div><div className="stat-label">Résultat Net</div></div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{tab === 'depenses' ? 'Nouvelle dépense' : 'Nouvelle recette'}</h3><button className="btn-icon" onClick={() => setShowModal(false)}><i className="bi bi-x-lg"></i></button></div>
            {tab !== 'depenses' ? (
              <form onSubmit={handleRecette}>
                <div className="modal-body">
                  <div className="grid-2">
                    <div className="form-group"><label className="form-label">Patient</label><select className="form-select" value={recForm.patient_id} onChange={e => setRecForm({...recForm, patient_id: e.target.value})}><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
                    <div className="form-group"><label className="form-label">Service</label><select className="form-select" value={recForm.service_id} onChange={e => setRecForm({...recForm, service_id: e.target.value})}><option value="">Sélectionner...</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group"><label className="form-label">Type d'acte *</label><select className="form-select" value={recForm.type_acte} onChange={e => setRecForm({...recForm, type_acte: e.target.value})} required><option value="">Sélectionner...</option>{typeActes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div className="form-group"><label className="form-label">Montant *</label><input type="number" className="form-input" value={recForm.montant} onChange={e => setRecForm({...recForm, montant: e.target.value})} required /></div>
                  </div>
                  <div className="form-group"><label className="form-label">Mode de paiement</label><select className="form-select" value={recForm.mode_paiement} onChange={e => setRecForm({...recForm, mode_paiement: e.target.value})}><option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option><option value="carte">Carte</option></select></div>
                </div>
                <div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer</button></div>
              </form>
            ) : (
              <form onSubmit={handleDepense}>
                <div className="modal-body">
                  <div className="grid-2">
                    <div className="form-group"><label className="form-label">Type *</label><select className="form-select" value={depForm.type_depense} onChange={e => setDepForm({...depForm, type_depense: e.target.value})} required><option value="">Sélectionner...</option>{typeDepenses.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div className="form-group"><label className="form-label">Montant *</label><input type="number" className="form-input" value={depForm.montant} onChange={e => setDepForm({...depForm, montant: e.target.value})} required /></div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group"><label className="form-label">Fournisseur</label><input type="text" className="form-input" value={depForm.fournisseur} onChange={e => setDepForm({...depForm, fournisseur: e.target.value})} /></div>
                    <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={depForm.date_depense} onChange={e => setDepForm({...depForm, date_depense: e.target.value})} /></div>
                  </div>
                  <div className="form-group"><label className="form-label">Description</label><input type="text" className="form-input" value={depForm.description} onChange={e => setDepForm({...depForm, description: e.target.value})} /></div>
                </div>
                <div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}