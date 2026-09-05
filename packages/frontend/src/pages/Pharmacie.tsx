import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getMedicaments, deleteMedicament, getStock, createStock, getMouvements, createMouvement, getPharmacieAlertes, getDispensations, approuverMouvement, rejeterMouvement } from '../services/api';
import { useSnackbar } from '../components/Snackbar';
import { useConfirm } from '../components/ConfirmDialog';

function currentRole(): string | undefined {
  try { return JSON.parse(localStorage.getItem('user') || '{}').role; } catch { return undefined; }
}

export default function Pharmacie() {
  const navigate = useNavigate();
  const role = currentRole();
  const [tab, setTab] = useState<'catalogue' | 'stock' | 'mouvements' | 'dispensations' | 'alertes'>('catalogue');
  const [medicaments, setMedicaments] = useState<any[]>([]);
  const [stock, setStockData] = useState<any[]>([]);
  const [mouvements, setMouvements] = useState<any[]>([]);
  const [dispensations, setDispensations] = useState<any[]>([]);
  const [alertes, setAlertes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState<string | null>(null);
  const [stockForm, setStockForm] = useState({ medicament_id: '', lot: '', date_expiration: '', quantite: '', quantite_min: '10', prix_achat: '', fournisseur: '' });
  const [mvtForm, setMvtForm] = useState({ medicament_id: '', type_mouvement: 'entree', quantite: '', lot: '', motif: '' });
  const { showSnackbar } = useSnackbar();
  const { confirm } = useConfirm();

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [m, s, mv, a, , d] = await Promise.all([
        getMedicaments(), getStock(), getMouvements(), getPharmacieAlertes(),
        api.get('/reference-lists/forme_pharmaceutique').catch(() => ({ data: [] })),
        getDispensations(),
      ]);
      setMedicaments(m.data); setStockData(s.data); setMouvements(mv.data); setAlertes(a.data);
      setDispensations(d.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDeleteMed = async (id: number, nom: string) => {
    const ok = await confirm({ message: `Désactiver le médicament "${nom}" ?`, variant: 'danger' });
    if (!ok) return;
    try {
      await deleteMedicament(id);
      showSnackbar('Médicament désactivé', 'success');
      loadAll();
    } catch { showSnackbar('Erreur lors de la désactivation', 'error'); }
  };

  const handleStock = async (e: React.FormEvent) => { e.preventDefault(); try { await createStock({ ...stockForm, quantite: Number(stockForm.quantite), quantite_min: Number(stockForm.quantite_min), prix_achat: stockForm.prix_achat ? Number(stockForm.prix_achat) : null }); setShowModal(null); loadAll(); showSnackbar('Stock enregistré', 'success'); } catch { showSnackbar('Erreur', 'error'); } };
  const handleMvt = async (e: React.FormEvent) => { e.preventDefault(); try { await createMouvement({ ...mvtForm, quantite: Number(mvtForm.quantite) }); setShowModal(null); setMvtForm({ medicament_id: '', type_mouvement: 'entree', quantite: '', lot: '', motif: '' }); loadAll(); showSnackbar('Mouvement enregistré', 'success'); } catch (err: any) { showSnackbar(err.response?.data?.error || 'Erreur lors de l\'enregistrement du mouvement', 'error'); } };

  const handleApprouverMvt = async (id: number) => {
    const ok = await confirm({ message: 'Approuver ce retrait pour péremption ? Le stock sera décrémenté.', variant: 'warning' });
    if (!ok) return;
    try { await approuverMouvement(id); showSnackbar('Retrait approuvé', 'success'); loadAll(); }
    catch (err: any) { showSnackbar(err.response?.data?.error || 'Erreur lors de l\'approbation', 'error'); }
  };
  const handleRejeterMvt = async (id: number) => {
    const ok = await confirm({ message: 'Rejeter ce retrait pour péremption ? Le stock ne sera pas modifié.', variant: 'danger' });
    if (!ok) return;
    try { await rejeterMouvement(id); showSnackbar('Retrait rejeté', 'success'); loadAll(); }
    catch (err: any) { showSnackbar(err.response?.data?.error || 'Erreur lors du rejet', 'error'); }
  };

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(n);
  const totalAlertes = alertes ? (alertes.stockBas?.length || 0) + (alertes.rupture?.length || 0) + (alertes.perimes?.length || 0) + (alertes.bientotPerimes?.length || 0) : 0;

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Pharmacie</span></nav>
      <div className="page-header"><h1 className="page-title">Pharmacie</h1>
        <div className="d-flex gap-1">
          {tab === 'catalogue' && <button className="btn-primary" onClick={() => navigate('/app/pharmacie/nouveau')}><i className="bi bi-plus-lg"></i> Nouveau médicament</button>}
          {tab === 'stock' && <button className="btn-primary" onClick={() => setShowModal(showModal === 'stock' ? null : 'stock')}><i className={`bi ${showModal === 'stock' ? 'bi-dash-lg' : 'bi-plus'}`}></i> Entrée stock</button>}
          {tab === 'mouvements' && <button className="btn-primary" onClick={() => setShowModal(showModal === 'mvt' ? null : 'mvt')}><i className={`bi ${showModal === 'mvt' ? 'bi-dash-lg' : 'bi-plus'}`}></i> Mouvement</button>}
        </div>
      </div>

      <div className="grid-4 mb-3">
        <div className="tile stat-tile"><div className="stat-value">{medicaments.length}</div><div className="stat-label">Médicaments</div></div>
        <div className="tile stat-tile"><div className="stat-value">{stock.length}</div><div className="stat-label">Lots en stock</div></div>
        <div className="tile stat-tile"><div className="stat-value text-danger">{totalAlertes}</div><div className="stat-label">Alertes</div></div>
        <div className="tile stat-tile"><div className="stat-value">{mouvements.length}</div><div className="stat-label">Mouvements récents</div></div>
      </div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'catalogue' ? 'active' : ''}`} onClick={() => setTab('catalogue')}>Catalogue</button>
        <button className={`tab-item ${tab === 'stock' ? 'active' : ''}`} onClick={() => setTab('stock')}>Stock</button>
        <button className={`tab-item ${tab === 'mouvements' ? 'active' : ''}`} onClick={() => setTab('mouvements')}>Mouvements</button>
        <button className={`tab-item ${tab === 'dispensations' ? 'active' : ''}`} onClick={() => setTab('dispensations')}>Dispensations</button>
        <button className={`tab-item ${tab === 'alertes' ? 'active' : ''}`} onClick={() => setTab('alertes')}>Alertes {totalAlertes > 0 && <span className="tag tag-red" style={{marginLeft:'0.25rem'}}>{totalAlertes}</span>}</button>
      </div>

      {tab === 'stock' && showModal === 'stock' && (
        <div className="tile mb-2" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Entrée de stock</h3>
          <form onSubmit={handleStock}>
            <div className="form-group"><label className="form-label">Médicament *</label><select className="form-select" value={stockForm.medicament_id} onChange={e => setStockForm({...stockForm, medicament_id: e.target.value})} required><option value="">Sélectionner...</option>{medicaments.map((m: any) => <option key={m.id} value={m.id}>{m.nom} {m.forme ? `(${m.forme})` : ''}</option>)}</select></div>
            <div className="grid-3"><div className="form-group"><label className="form-label">Quantité *</label><input type="number" className="form-input" value={stockForm.quantite} onChange={e => setStockForm({...stockForm, quantite: e.target.value})} required /></div><div className="form-group"><label className="form-label">Seuil min</label><input type="number" className="form-input" value={stockForm.quantite_min} onChange={e => setStockForm({...stockForm, quantite_min: e.target.value})} /></div><div className="form-group"><label className="form-label">Lot</label><input type="text" className="form-input" value={stockForm.lot} onChange={e => setStockForm({...stockForm, lot: e.target.value})} /></div></div>
            <div className="grid-2"><div className="form-group"><label className="form-label">Date expiration</label><input type="date" className="form-input" value={stockForm.date_expiration} onChange={e => setStockForm({...stockForm, date_expiration: e.target.value})} /></div><div className="form-group"><label className="form-label">Fournisseur</label><input type="text" className="form-input" value={stockForm.fournisseur} onChange={e => setStockForm({...stockForm, fournisseur: e.target.value})} /></div></div>
            <div className="d-flex gap-1" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}><button type="button" className="btn-secondary" onClick={() => setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer</button></div>
          </form>
        </div>
      )}

      {tab === 'mouvements' && showModal === 'mvt' && (
        <div className="tile mb-2" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Mouvement de stock</h3>
          <form onSubmit={handleMvt}>
            <div className="grid-2"><div className="form-group"><label className="form-label">Médicament *</label><select className="form-select" value={mvtForm.medicament_id} onChange={e => setMvtForm({...mvtForm, medicament_id: e.target.value})} required><option value="">Sélectionner...</option>{medicaments.map((m: any) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></div><div className="form-group"><label className="form-label">Type *</label><select className="form-select" value={mvtForm.type_mouvement} onChange={e => setMvtForm({...mvtForm, type_mouvement: e.target.value})}><option value="entree">Entrée</option><option value="sortie">Sortie</option><option value="ajustement">Ajustement (correction)</option><option value="perime">Périmé (retrait — validation admin)</option></select></div></div>
            <div className="grid-2"><div className="form-group"><label className="form-label">Quantité *</label><input type="number" className="form-input" value={mvtForm.quantite} onChange={e => setMvtForm({...mvtForm, quantite: e.target.value})} required /></div><div className="form-group"><label className="form-label">Lot</label><input type="text" className="form-input" value={mvtForm.lot} onChange={e => setMvtForm({...mvtForm, lot: e.target.value})} /></div></div>
            <div className="form-group"><label className="form-label">Motif</label><input type="text" className="form-input" value={mvtForm.motif} onChange={e => setMvtForm({...mvtForm, motif: e.target.value})} /></div>
            <div className="d-flex gap-1" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}><button type="button" className="btn-secondary" onClick={() => setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer</button></div>
          </form>
        </div>
      )}

      {tab === 'catalogue' && (
        <table className="data-table"><thead><tr><th>Nom</th><th>DCI</th><th>Forme</th><th>Dosage</th><th>Catégorie</th><th>Prix</th><th>Actions</th></tr></thead>
          <tbody>{medicaments.map((m: any) => <tr key={m.id}>
            <td className="fw-600" style={{cursor:'pointer',color:'var(--cds-link)'}} onClick={() => navigate(`/app/pharmacie/${m.id}`)}>{m.nom}</td>
            <td>{m.dci || '-'}</td><td>{m.forme || '-'}</td><td>{m.dosage_standard || '-'}</td>
            <td><span className="tag tag-gray">{m.categorie || '-'}</span></td>
            <td>{m.prix_unitaire ? fmt(parseFloat(m.prix_unitaire)) : '-'}</td>
            <td><div className="d-flex gap-05">
              <button className="btn-sm btn-secondary" onClick={() => navigate(`/app/pharmacie/${m.id}`)} title="Voir"><i className="bi bi-eye"></i></button>
              <button className="btn-sm btn-secondary" onClick={() => navigate(`/app/pharmacie/${m.id}/modifier`)} title="Modifier"><i className="bi bi-pencil"></i></button>
              <button className="btn-sm btn-danger" onClick={() => handleDeleteMed(m.id, m.nom)} title="Désactiver"><i className="bi bi-trash"></i></button>
            </div></td>
          </tr>)}
          {medicaments.length === 0 && <tr><td colSpan={7} className="table-empty">Aucun médicament</td></tr>}</tbody>
        </table>
      )}

      {tab === 'stock' && (
        <table className="data-table"><thead><tr><th>Médicament</th><th>Lot</th><th>Quantité</th><th>Seuil min</th><th>Expiration</th><th>Fournisseur</th></tr></thead>
          <tbody>{stock.map((s: any) => <tr key={s.id} style={{ background: s.quantite <= s.quantite_min ? '#ffd7d9' : undefined }}><td className="fw-600">{s.medicament_nom}</td><td>{s.lot || '-'}</td><td className={s.quantite <= s.quantite_min ? 'text-danger fw-600' : ''}>{s.quantite}</td><td>{s.quantite_min}</td><td>{s.date_expiration ? new Date(s.date_expiration).toLocaleDateString('fr-FR') : '-'}</td><td>{s.fournisseur || '-'}</td></tr>)}
          {stock.length === 0 && <tr><td colSpan={6} className="table-empty">Aucun stock</td></tr>}</tbody>
        </table>
      )}

      {tab === 'mouvements' && (
        <table className="data-table"><thead><tr><th>Date</th><th>Médicament</th><th>Type</th><th>Quantité</th><th>Lot</th><th>Motif</th><th>Par</th><th>Statut</th>{role === 'admin' && <th>Actions</th>}</tr></thead>
          <tbody>{mouvements.map((m: any) => <tr key={m.id} style={m.orphelin ? { background: '#ffd7d9' } : undefined}>
            <td>{new Date(m.created_at).toLocaleString('fr-FR')}</td>
            <td>{m.medicament_nom}</td>
            <td><span className={`tag ${m.type_mouvement === 'entree' ? 'tag-green' : m.type_mouvement === 'sortie' ? 'tag-red' : m.type_mouvement === 'perime' ? 'tag-purple' : 'tag-yellow'}`}>{m.type_mouvement}</span></td>
            <td>{m.quantite}</td>
            <td className={m.orphelin ? 'text-danger fw-600' : ''} title={m.orphelin ? `Aucun lot "${m.lot}" en stock — ce mouvement n'a pas modifié le stock, à corriger` : undefined}>
              {m.lot || '-'}{m.orphelin && <i className="bi bi-exclamation-triangle-fill" style={{ marginLeft: '0.35rem' }}></i>}
            </td>
            <td>{m.motif || '-'}</td><td>{m.user_prenom} {m.user_nom}</td>
            <td><span className={`tag ${m.statut === 'valide' ? 'tag-green' : m.statut === 'rejete' ? 'tag-red' : 'tag-yellow'}`}>{m.statut === 'valide' ? 'Validé' : m.statut === 'rejete' ? 'Rejeté' : 'En attente'}</span></td>
            {role === 'admin' && <td>{m.statut === 'en_attente' && <div className="d-flex gap-05">
              <button className="btn-sm btn-secondary" title="Approuver" onClick={() => handleApprouverMvt(m.id)}><i className="bi bi-check-lg"></i></button>
              <button className="btn-sm btn-danger" title="Rejeter" onClick={() => handleRejeterMvt(m.id)}><i className="bi bi-x-lg"></i></button>
            </div>}</td>}
          </tr>)}
          {mouvements.length === 0 && <tr><td colSpan={role === 'admin' ? 9 : 8} className="table-empty">Aucun mouvement</td></tr>}</tbody>
        </table>
      )}

      {tab === 'dispensations' && (
        <table className="data-table"><thead><tr><th>Date</th><th>Patient</th><th>Médicament</th><th>Quantité</th><th>Notes</th><th>Dispensé par</th></tr></thead>
          <tbody>{dispensations.map((d: any) => <tr key={d.id}><td>{new Date(d.date_dispensation).toLocaleString('fr-FR')}</td><td>{d.patient_prenom ? `${d.patient_prenom} ${d.patient_nom}` : '-'}</td><td className="fw-600">{d.medicament_nom || '-'}</td><td>{d.quantite_delivree || '-'}</td><td>{d.notes || '-'}</td><td>{d.dispenseur_prenom} {d.dispenseur_nom}</td></tr>)}
          {dispensations.length === 0 && <tr><td colSpan={6} className="table-empty">Aucune dispensation</td></tr>}</tbody>
        </table>
      )}

      {tab === 'alertes' && alertes && (
        <div>
          {alertes.rupture?.length > 0 && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-octagon"></i><div><strong>Rupture de stock ({alertes.rupture.length})</strong><ul style={{margin:'0.25rem 0 0 1rem',fontSize:'0.8125rem'}}>{alertes.rupture.map((a: any) => <li key={a.id}>{a.medicament_nom}</li>)}</ul></div></div>}
          {alertes.stockBas?.length > 0 && <div className="notification notification-warning mb-2"><i className="bi bi-exclamation-triangle"></i><div><strong>Stock bas ({alertes.stockBas.length})</strong><ul style={{margin:'0.25rem 0 0 1rem',fontSize:'0.8125rem'}}>{alertes.stockBas.map((a: any) => <li key={a.id}>{a.medicament_nom} — {a.quantite} restants (seuil: {a.quantite_min})</li>)}</ul></div></div>}
          {alertes.perimes?.length > 0 && <div className="notification notification-error mb-2"><i className="bi bi-calendar-x"></i><div><strong>Périmés ({alertes.perimes.length})</strong><ul style={{margin:'0.25rem 0 0 1rem',fontSize:'0.8125rem'}}>{alertes.perimes.map((a: any) => <li key={a.id}>{a.medicament_nom} — Lot: {a.lot} — Exp: {new Date(a.date_expiration).toLocaleDateString('fr-FR')}</li>)}</ul></div></div>}
          {alertes.bientotPerimes?.length > 0 && <div className="notification notification-info mb-2"><i className="bi bi-clock"></i><div><strong>Expire dans 30 jours ({alertes.bientotPerimes.length})</strong><ul style={{margin:'0.25rem 0 0 1rem',fontSize:'0.8125rem'}}>{alertes.bientotPerimes.map((a: any) => <li key={a.id}>{a.medicament_nom} — Exp: {new Date(a.date_expiration).toLocaleDateString('fr-FR')}</li>)}</ul></div></div>}
          {totalAlertes === 0 && <div className="table-empty"><i className="bi bi-check-circle" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem',color:'var(--cds-support-success)'}}></i>Aucune alerte</div>}
        </div>
      )}

    </div>
  );
}
