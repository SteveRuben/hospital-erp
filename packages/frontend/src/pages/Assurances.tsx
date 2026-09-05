import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAssurancesAdmin,
  getPrisesEnCharge, updatePECStatut,
  type AssuranceAdminRow, type PriseEnChargeRow,
} from '../services/api';
import { useSnackbar } from '../components/Snackbar';
import { AuthContext } from '../App';

const STATUT_TAG: Record<PriseEnChargeRow['statut'], string> = {
  en_attente: 'tag-orange',
  accordee:   'tag-blue',
  payee:      'tag-green',
  refusee:    'tag-red',
};
const STATUT_LABEL: Record<PriseEnChargeRow['statut'], string> = {
  en_attente: 'En attente',
  accordee:   'Accordée',
  payee:      'Payée',
  refusee:    'Refusée',
};

const fmt = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(Number(n));

export default function Assurances() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { showSnackbar } = useSnackbar();
  const [tab, setTab] = useState<'pec' | 'registre'>('pec');
  const [loading, setLoading] = useState(true);

  // PEC
  const [pec, setPec] = useState<PriseEnChargeRow[]>([]);
  const [filterAssurance, setFilterAssurance] = useState<string>('');
  const [filterStatut, setFilterStatut] = useState<string>('');
  const [editPec, setEditPec] = useState<{ row: PriseEnChargeRow; nextStatut: PriseEnChargeRow['statut']; notes: string } | null>(null);

  // Registre
  const [assurances, setAssurances] = useState<AssuranceAdminRow[]>([]);

  const isAdmin = user?.role === 'admin';
  const canEdit = user?.role === 'admin' || user?.role === 'comptable';

  useEffect(() => { void loadAll(); }, [filterAssurance, filterStatut]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        getAssurancesAdmin().catch(() => ({ data: [] })),
        getPrisesEnCharge({
          assurance_id: filterAssurance ? Number(filterAssurance) : undefined,
          statut: filterStatut || undefined,
        }).catch(() => ({ data: [] })),
      ]);
      setAssurances(a.data); setPec(p.data);
    } finally { setLoading(false); }
  };

  const submitChangeStatut = async () => {
    if (!editPec) return;
    try {
      await updatePECStatut(editPec.row.id, editPec.nextStatut, editPec.notes || undefined);
      setEditPec(null);
      await loadAll();
      showSnackbar('Statut mis à jour', 'success');
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur', 'error');
    }
  };

  if (loading && pec.length === 0 && assurances.length === 0) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  // Stats agrégats pour le résumé du haut
  const totalAttente = assurances.reduce((s, a) => s + a.nb_en_attente, 0);
  const totalAccordee = assurances.reduce((s, a) => s + a.nb_accordee, 0);
  const montantARecouvrer = assurances.reduce((s, a) => s + Number(a.montant_a_recouvrer), 0);
  const montantRecouvre = assurances.reduce((s, a) => s + Number(a.montant_recouvre), 0);

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Assurances</span></nav>
      <div className="page-header"><h1 className="page-title">Assurances & prises en charge</h1></div>

      <div className="grid-4 mb-3">
        <div className="tile stat-tile">
          <div className="stat-value">{totalAttente}</div>
          <div className="stat-label">PEC en attente</div>
        </div>
        <div className="tile stat-tile">
          <div className="stat-value text-info">{totalAccordee}</div>
          <div className="stat-label">PEC accordées</div>
        </div>
        <div className="tile stat-tile">
          <div className="stat-value text-warning">{fmt(montantARecouvrer)}</div>
          <div className="stat-label">À recouvrer</div>
        </div>
        <div className="tile stat-tile">
          <div className="stat-value text-success">{fmt(montantRecouvre)}</div>
          <div className="stat-label">Recouvré</div>
        </div>
      </div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'pec' ? 'active' : ''}`} onClick={() => setTab('pec')}>Prises en charge ({pec.length})</button>
        <button className={`tab-item ${tab === 'registre' ? 'active' : ''}`} onClick={() => setTab('registre')}>Registre des assurances ({assurances.length})</button>
      </div>

      {tab === 'pec' && (
        <div>
          <div className="tile mb-2" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
              <select className="form-select" value={filterAssurance} onChange={e => setFilterAssurance(e.target.value)} style={{ fontSize: '0.8125rem' }}>
                <option value="">Toutes les assurances</option>
                {assurances.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '160px' }}>
              <select className="form-select" value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ fontSize: '0.8125rem' }}>
                <option value="">Tous les statuts</option>
                <option value="en_attente">En attente</option>
                <option value="accordee">Accordée</option>
                <option value="payee">Payée</option>
                <option value="refusee">Refusée</option>
              </select>
            </div>
            {(filterAssurance || filterStatut) && (
              <button className="btn-ghost btn-sm" onClick={() => { setFilterAssurance(''); setFilterStatut(''); }}>Réinitialiser</button>
            )}
          </div>

          <table className="data-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Date</th><th>Patient</th><th>Assurance</th><th>N° police</th><th>Examen</th><th>Total</th><th>Assurance</th><th>Patient</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {pec.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td className="fw-600" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/patients/${p.patientId}`)}>
                    {p.patient_prenom} {p.patient_nom}
                    {p.patient_reference && <span className="text-muted" style={{ marginLeft: '0.375rem', fontSize: '0.6875rem' }}>{p.patient_reference}</span>}
                  </td>
                  <td>{p.assurance_nom}{p.assurance_code && <span className="text-muted" style={{ fontSize: '0.6875rem', marginLeft: '0.25rem' }}>({p.assurance_code})</span>}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{p.numeroPolice}</td>
                  <td>{p.examen_type || '-'}</td>
                  <td className="fw-600">{fmt(p.montantTotal)}</td>
                  <td className="text-info">{fmt(p.montantAssurance)}</td>
                  <td>{fmt(p.montantPatient)}</td>
                  <td><span className={`tag ${STATUT_TAG[p.statut]}`}>{STATUT_LABEL[p.statut]}</span></td>
                  <td>
                    {canEdit && p.statut !== 'payee' && p.statut !== 'refusee' && (
                      <div className="d-flex gap-1">
                        {p.statut === 'en_attente' && (
                          <>
                            <button className="btn-ghost btn-sm" title="Accorder" onClick={() => setEditPec({ row: p, nextStatut: 'accordee', notes: '' })}><i className="bi bi-check-circle text-info"></i></button>
                            <button className="btn-ghost btn-sm" title="Refuser" onClick={() => setEditPec({ row: p, nextStatut: 'refusee', notes: '' })}><i className="bi bi-x-circle text-danger"></i></button>
                          </>
                        )}
                        {p.statut === 'accordee' && (
                          <button className="btn-ghost btn-sm" title="Marquer payée" onClick={() => setEditPec({ row: p, nextStatut: 'payee', notes: '' })}><i className="bi bi-cash-coin text-success"></i></button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {pec.length === 0 && (
                <tr><td colSpan={10} className="table-empty"><i className="bi bi-shield-check" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}></i>Aucune prise en charge dans ces filtres</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'registre' && (
        <div>
          <div className="d-flex justify-between align-center mb-2">
            <p className="text-muted" style={{ fontSize: '0.8125rem', margin: 0 }}>
              Compagnies acceptées par l'établissement. Le taux par défaut hydrate la part « assurance » dans le modal de paiement.
            </p>
            {isAdmin && (
              <button className="btn-primary btn-sm" onClick={() => navigate('/app/assurances/nouvelle')}><i className="bi bi-plus"></i> Nouvelle assurance</button>
            )}
          </div>
          <table className="data-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Nom</th><th>Code</th><th>Contact</th><th>Taux défaut</th><th>Actif</th><th>En attente</th><th>Accordées</th><th>Payées</th><th>Refusées</th><th>À recouvrer</th><th>Recouvré</th><th></th></tr></thead>
            <tbody>
              {assurances.map(a => (
                <tr key={a.id} style={{ opacity: a.actif ? 1 : 0.55 }}>
                  <td className="fw-600">{a.nom}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.6875rem' }}>{a.code || '-'}</td>
                  <td>{a.contact || '-'}</td>
                  <td>{a.tauxDefaut != null ? `${a.tauxDefaut} %` : '-'}</td>
                  <td>{a.actif ? <span className="tag tag-green">Actif</span> : <span className="tag tag-gray">Inactif</span>}</td>
                  <td>{a.nb_en_attente}</td>
                  <td className="text-info">{a.nb_accordee}</td>
                  <td className="text-success">{a.nb_payee}</td>
                  <td className="text-danger">{a.nb_refusee}</td>
                  <td className="text-warning fw-600">{fmt(a.montant_a_recouvrer)}</td>
                  <td className="text-success fw-600">{fmt(a.montant_recouvre)}</td>
                  <td>
                    {isAdmin && (
                      <button className="btn-icon" title="Modifier" onClick={() => navigate(`/app/assurances/${a.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                    )}
                  </td>
                </tr>
              ))}
              {assurances.length === 0 && (
                <tr><td colSpan={12} className="table-empty">Aucune assurance enregistrée</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal — changer le statut d'une PEC */}
      {editPec && (
        <div className="modal-overlay" onClick={() => setEditPec(null)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>{STATUT_LABEL[editPec.nextStatut]} la prise en charge</h3>
              <button className="btn-icon" onClick={() => setEditPec(null)}><i className="bi bi-x-lg"></i></button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--cds-ui-01)', padding: '0.5rem 0.75rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                <div className="fw-600">{editPec.row.patient_prenom} {editPec.row.patient_nom}</div>
                <div className="text-muted">{editPec.row.assurance_nom} — {editPec.row.numeroPolice}</div>
                <div className="text-muted" style={{ marginTop: '0.25rem' }}>
                  Total {fmt(editPec.row.montantTotal)} — Assurance {fmt(editPec.row.montantAssurance)}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes (optionnel)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={editPec.notes}
                  onChange={e => setEditPec({ ...editPec, notes: e.target.value })}
                  placeholder={editPec.nextStatut === 'refusee' ? 'Motif du refus' : editPec.nextStatut === 'payee' ? 'Référence du virement assureur' : ''}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditPec(null)}>Annuler</button>
              <button className="btn-primary" onClick={submitChangeStatut}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
