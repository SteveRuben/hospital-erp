import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExamens, updateExamen, deleteExamen, getPatients } from '../services/api';
import { useSnackbar } from '../components/Snackbar';
import { useBranding } from '../components/BrandingProvider';
import { formatMoney } from '../components/format';
import type { Examen, Patient } from '../types';

type ExamenAug = Examen & {
  statut?: string;
  paye?: boolean;
  date_paiement?: string | null;
  mode_paiement?: string | null;
};

const statutLabels: Record<string, { label: string; tag: string }> = {
  demande: { label: 'Demandé', tag: 'tag-gray' },
  a_payer: { label: 'À payer', tag: 'tag-orange' },
  prelevement: { label: 'Prélèvement', tag: 'tag-blue' },
  analyse: { label: 'Analyse', tag: 'tag-yellow' },
  resultat: { label: 'Résultat', tag: 'tag-purple' },
  valide: { label: 'Validé', tag: 'tag-green' },
  transmis: { label: 'Transmis', tag: 'tag-teal' },
};

// Workflow: a paid-at-creation examen goes 'demande' → 'prelevement' directly.
// An unpaid one starts at 'a_payer'; marquer-paye advances it to 'prelevement'.
const STATUTS = ['demande', 'a_payer', 'prelevement', 'analyse', 'resultat', 'valide', 'transmis'];
const nextStatut: Record<string, string> = {
  demande: 'prelevement',
  prelevement: 'analyse',
  analyse: 'resultat',
  resultat: 'valide',
  valide: 'transmis',
};
const nextAction: Record<string, string> = {
  demande: 'Prélever',
  prelevement: 'Analyser',
  analyse: 'Saisir résultat',
  resultat: 'Valider',
  valide: 'Transmettre',
};

export default function Laboratoire() {
  const [examens, setExamens] = useState<ExamenAug[]>([]);
  const [, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'kanban'>('kanban');
  const [resultModal, setResultModal] = useState<ExamenAug | null>(null);
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const { branding } = useBranding();
  const money = (n: number) => formatMoney(n, branding.devise);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [e, p] = await Promise.all([getExamens(), getPatients({ archived: 'false' })]);
      setExamens(e.data as ExamenAug[]);
      setPatients(p.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const changeStatut = async (examen: ExamenAug, newStatut: string) => {
    try {
      await updateExamen(examen.id, { statut: newStatut });
      loadData();
    } catch { showSnackbar('Erreur lors du changement de statut', 'error'); }
  };

  // 'Saisir résultat' from analyse → open a modal that captures the text
  // BEFORE the statut transitions. Without this the resultat field stayed
  // empty and the user couldn't enter it from the Kanban.
  const handleAnalyseClick = (examen: ExamenAug) => setResultModal(examen);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const totalExamens = examens.length;
  const totalRevenus = examens.reduce((s, e) => s + (Number(e.montant) || 0), 0);

  const cardForStatut = (s: string) =>
    examens.filter(e => (e.statut ?? 'demande') === s);

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Laboratoire</span></nav>
      <div className="page-header">
        <h1 className="page-title">Laboratoire</h1>
        <div className="d-flex gap-1">
          <button className={view === 'kanban' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setView('kanban')}><i className="bi bi-kanban"></i> Kanban</button>
          <button className={view === 'table' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setView('table')}><i className="bi bi-table"></i> Table</button>
          <button className="btn-primary" onClick={() => navigate('/app/laboratoire/nouveau')}><i className="bi bi-plus"></i> Nouvel examen</button>
        </div>
      </div>

      <div className="grid-3 mb-3">
        <div className="tile stat-tile"><div className="stat-value">{totalExamens}</div><div className="stat-label">Total examens</div></div>
        <div className="tile stat-tile"><div className="stat-value text-success">{money(totalRevenus)}</div><div className="stat-label">Revenus</div></div>
        <div className="tile stat-tile"><div className="stat-value">{new Set(examens.map(e => e.type_examen)).size}</div><div className="stat-label">Types d'examens</div></div>
      </div>

      {view === 'kanban' ? (
        <div className="kanban">
          {STATUTS.map(s => {
            const items = cardForStatut(s);
            return (
              <div className="kanban-column" key={s}>
                <div className="kanban-column-header"><span>{statutLabels[s]?.label || s}</span><span className="count">{items.length}</span></div>
                {items.map(ex => {
                  const dt = ex.date_examen ? new Date(ex.date_examen) : null;
                  const dateLabel = dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('fr-FR') : '—';
                  return (
                    <div className="kanban-card" key={ex.id}>
                      <h4>{ex.patient_prenom} {ex.patient_nom}</h4>
                      <p>{ex.type_examen}</p>
                      <p style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>{dateLabel}</p>
                      {ex.montant != null && Number(ex.montant) > 0 && (
                        <p className="text-success fw-600" style={{ fontSize: '0.8125rem' }}>
                          {money(Number(ex.montant))}
                          {ex.paye && <span style={{ color: 'var(--cds-text-secondary)', fontWeight: 400, fontSize: '0.625rem', marginLeft: '0.25rem' }}>✓ payé</span>}
                        </p>
                      )}
                      {/* Show the result preview from 'resultat' onwards so it stays
                          visible all the way through 'transmis' — previously the
                          card hid it once the workflow advanced past 'analyse'. */}
                      {ex.resultat && ['resultat', 'valide', 'transmis'].includes(s) && (
                        <p style={{ fontSize: '0.75rem', background: 'var(--cds-ui-01)', padding: '0.25rem 0.5rem', marginTop: '0.25rem', borderLeft: '2px solid var(--cds-support-info)' }}>
                          {ex.resultat.length > 80 ? ex.resultat.substring(0, 80) + '…' : ex.resultat}
                        </p>
                      )}
                      {s === 'a_payer' && (
                        // Payment is collected at the front desk (Facturation),
                        // not at the lab. Show a read-only badge so the lab knows
                        // why the card hasn't moved to prélèvement yet.
                        <div style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                          <i className="bi bi-cash-stack"></i> En attente de paiement à la caisse
                        </div>
                      )}
                      {s === 'analyse' && (
                        <button className="btn-primary btn-sm mt-1" onClick={() => handleAnalyseClick(ex)}>
                          {nextAction[s]} →
                        </button>
                      )}
                      {s !== 'a_payer' && s !== 'analyse' && nextStatut[s] && (
                        <button className="btn-ghost btn-sm mt-1" onClick={() => changeStatut(ex, nextStatut[s])}>
                          {nextAction[s]} →
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <table className="data-table"><thead><tr><th>Date</th><th>Patient</th><th>Type</th><th>Statut</th><th>Résultat</th><th>Montant</th><th></th></tr></thead>
          <tbody>
            {examens.map(ex => {
              const dt = ex.date_examen ? new Date(ex.date_examen) : null;
              const dateLabel = dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('fr-FR') : '—';
              const statut = ex.statut ?? 'demande';
              return (
                <tr key={ex.id}>
                  <td>{dateLabel}</td>
                  <td>{ex.patient_prenom} {ex.patient_nom}</td>
                  <td>{ex.type_examen}</td>
                  <td><span className={`tag ${statutLabels[statut]?.tag}`}>{statutLabels[statut]?.label}</span></td>
                  <td>{ex.resultat || '-'}</td>
                  <td>{ex.montant ? money(Number(ex.montant)) : '-'}</td>
                  <td>
                    <button className="btn-icon" onClick={() => navigate(`/app/laboratoire/${ex.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                    <button className="btn-icon" onClick={async () => { if (confirm('Supprimer ?')) { await deleteExamen(ex.id); loadData(); }}}><i className="bi bi-trash"></i></button>
                  </td>
                </tr>
              );
            })}
            {examens.length === 0 && <tr><td colSpan={7} className="table-empty"><i className="bi bi-flask"></i>Aucun examen</td></tr>}
          </tbody>
        </table>
      )}

      {resultModal && (
        <ResultEntryModal
          examen={resultModal}
          onClose={() => setResultModal(null)}
          onDone={() => { setResultModal(null); showSnackbar('Résultat enregistré', 'success'); loadData(); }}
        />
      )}
    </div>
  );
}

function ResultEntryModal({ examen, onClose, onDone }: { examen: ExamenAug; onClose: () => void; onDone: () => void }) {
  const [resultat, setResultat] = useState(examen.resultat ?? '');
  const [saving, setSaving] = useState(false);
  const { showSnackbar } = useSnackbar();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultat.trim()) { showSnackbar('Le résultat est requis', 'warning'); return; }
    setSaving(true);
    try {
      // Single PUT carries the text AND advances the Kanban — one round-trip,
      // and the notification side-effect (demandeur notified) lands in the
      // same call as the result entry.
      await updateExamen(examen.id, { resultat: resultat.trim(), statut: 'resultat' });
      onDone();
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Saisir le résultat</h3><button className="btn-icon" onClick={onClose}><i className="bi bi-x-lg"></i></button></div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>
              Examen <strong>{examen.type_examen}</strong> pour <strong>{examen.patient_prenom} {examen.patient_nom}</strong>.
            </p>
            <div className="form-group">
              <label className="form-label">Résultat *</label>
              <textarea className="form-input" rows={5} value={resultat} onChange={e => setResultat(e.target.value)} autoFocus required />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? '…' : 'Enregistrer et passer à « Résultat »'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
