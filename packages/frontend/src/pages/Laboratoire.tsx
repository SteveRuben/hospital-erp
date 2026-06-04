import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../App';
import { getExamens, updateExamen, deleteExamen, getPatients } from '../services/api';
import { useSnackbar } from '../components/Snackbar';
import { useBranding } from '../components/BrandingProvider';
import { formatMoney } from '../components/format';
import ExamenFichiers from '../components/ExamenFichiers';
import type { Examen, Patient } from '../types';

// Statuts à partir desquels les pièces jointes existent (et sont
// uploadables). Avant 'analyse' il n'y a logiquement rien à joindre.
const FICHIERS_STATUTS = new Set(['analyse', 'resultat', 'valide', 'transmis']);

type ExamenAug = Examen & {
  statut?: string;
  paye?: boolean;
  date_paiement?: string | null;
  mode_paiement?: string | null;
  demandeur_id?: number | null;
  demandeur_nom?: string | null;
  demandeur_prenom?: string | null;
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
// Retour en arrière le long des étapes cliniques — réservé à l'admin (flux
// bidirectionnel). On ne recule pas dans les états de paiement (a_payer/demande),
// gérés à la caisse.
const prevStatut: Record<string, string> = {
  analyse: 'prelevement',
  resultat: 'analyse',
  valide: 'resultat',
  transmis: 'valide',
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
  const { user } = useContext(AuthContext);
  const money = (n: number) => formatMoney(n, branding.devise);
  // admin + laborantin pilotent tout le workflow ; le médecin a un accès en
  // lecture et ne peut que valider un résultat (résultat → validé).
  const canLabWorkflow = user?.role === 'admin' || user?.role === 'laborantin';
  const isMedecin = user?.role === 'medecin';

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
                  const prio = (ex as any).priorite as 'urgent' | 'prioritaire' | 'normal' | undefined;
                  // Ancienneté pour les examens en attente de résultat (pas encore
                  // d'analyse rendue). Au-delà de 2 j, on signale en orange.
                  const ageDays = dt && !isNaN(dt.getTime()) ? Math.floor((Date.now() - dt.getTime()) / 86400000) : 0;
                  const awaitingResult = s === 'prelevement' || s === 'analyse';
                  return (
                    <div className="kanban-card" key={ex.id} style={prio === 'urgent' ? { borderLeft: '4px solid var(--cds-support-error)' } : prio === 'prioritaire' ? { borderLeft: '4px solid var(--cds-support-warning)' } : undefined}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h4>{ex.patient_prenom} {ex.patient_nom}</h4>
                        {prio === 'urgent' && <span className="tag tag-red" style={{ fontSize: '0.5625rem', whiteSpace: 'nowrap' }}><i className="bi bi-exclamation-octagon-fill"></i> URGENT</span>}
                        {prio === 'prioritaire' && <span className="tag tag-orange" style={{ fontSize: '0.5625rem', whiteSpace: 'nowrap' }}>prioritaire</span>}
                      </div>
                      <p>{ex.type_examen}</p>
                      {(ex.demandeur_prenom || ex.demandeur_nom) && (
                        <p style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }} title="Médecin prescripteur">
                          <i className="bi bi-person"></i> Dr. {ex.demandeur_prenom} {ex.demandeur_nom}
                        </p>
                      )}
                      <p style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>{dateLabel}</p>
                      {awaitingResult && (
                        <span className={`tag ${ageDays >= 2 ? 'tag-orange' : 'tag-blue'}`} style={{ fontSize: '0.5625rem' }} title="En attente de résultat">
                          <i className="bi bi-hourglass-split"></i> en attente{ageDays > 0 ? ` ${ageDays}j` : ''}
                        </span>
                      )}
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
                      {FICHIERS_STATUTS.has(s) && (
                        <ExamenFichiers examenId={ex.id} canUpload={true} variant="compact" />
                      )}
                      {s === 'analyse' && canLabWorkflow && (
                        <button className="btn-primary btn-sm mt-1" onClick={() => handleAnalyseClick(ex)}>
                          {nextAction[s]} →
                        </button>
                      )}
                      {s === 'resultat' && canLabWorkflow && (
                        <button className="btn-ghost btn-sm mt-1" onClick={() => setResultModal(ex)} title="Corriger le résultat avant validation">
                          <i className="bi bi-pencil"></i> Modifier le résultat
                        </button>
                      )}
                      {s !== 'a_payer' && s !== 'analyse' && nextStatut[s] &&
                        (canLabWorkflow || (isMedecin && s === 'resultat')) && (
                        <button className="btn-ghost btn-sm mt-1" onClick={() => changeStatut(ex, nextStatut[s])}>
                          {nextAction[s]} →
                        </button>
                      )}
                      {user?.role === 'admin' && prevStatut[s] && (
                        <button className="btn-ghost btn-sm mt-1" style={{ color: 'var(--cds-text-secondary)' }} title="Revenir à l'étape précédente" onClick={() => changeStatut(ex, prevStatut[s])}>
                          ← {statutLabels[prevStatut[s]]?.label}
                        </button>
                      )}
                      {canLabWorkflow && (
                        <button className="btn-ghost btn-sm mt-1" style={{ color: 'var(--cds-text-secondary)' }} title="Consulter / corriger l'examen (type, montant, date, priorité, prescripteur, résultat)" onClick={() => navigate(`/app/laboratoire/${ex.id}/modifier`)}>
                          <i className="bi bi-pencil-square"></i> Modifier l'examen
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
        <table className="data-table"><thead><tr><th>Date</th><th>Patient</th><th>Type</th><th>Prescripteur</th><th>Statut</th><th>Résultat</th><th>Montant</th><th></th></tr></thead>
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
                  <td>{(ex.demandeur_prenom || ex.demandeur_nom) ? `Dr. ${ex.demandeur_prenom ?? ''} ${ex.demandeur_nom ?? ''}`.trim() : '-'}</td>
                  <td><span className={`tag ${statutLabels[statut]?.tag}`}>{statutLabels[statut]?.label}</span></td>
                  <td>{ex.resultat || '-'}</td>
                  <td>{ex.montant ? money(Number(ex.montant)) : '-'}</td>
                  <td>
                    {isMedecin && statut === 'resultat' && (
                      <button className="btn-ghost btn-sm" onClick={() => changeStatut(ex, 'valide')}>Valider</button>
                    )}
                    {canLabWorkflow && (
                      <button className="btn-icon" onClick={() => navigate(`/app/laboratoire/${ex.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                    )}
                    {user?.role === 'admin' && (
                      <button className="btn-icon" onClick={async () => { if (confirm('Supprimer ?')) { await deleteExamen(ex.id); loadData(); }}}><i className="bi bi-trash"></i></button>
                    )}
                  </td>
                </tr>
              );
            })}
            {examens.length === 0 && <tr><td colSpan={8} className="table-empty"><i className="bi bi-flask"></i>Aucun examen</td></tr>}
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
  // Correction d'un résultat déjà saisi (statut 'resultat') vs première saisie
  // depuis 'analyse'. Le PUT reste idempotent (resultat -> resultat autorisé).
  const isEditingResult = (examen.statut ?? '') === 'resultat';

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
        <div className="modal-header"><h3>{isEditingResult ? 'Corriger le résultat' : 'Saisir le résultat'}</h3><button className="btn-icon" onClick={onClose}><i className="bi bi-x-lg"></i></button></div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>
              Examen <strong>{examen.type_examen}</strong> pour <strong>{examen.patient_prenom} {examen.patient_nom}</strong>.
            </p>
            <div className="form-group">
              <label className="form-label">Résultat *</label>
              <textarea className="form-input" rows={5} value={resultat} onChange={e => setResultat(e.target.value)} autoFocus required />
            </div>
            <ExamenFichiers examenId={examen.id} canUpload={true} variant="full" />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? '…' : (isEditingResult ? 'Enregistrer la correction' : 'Enregistrer et passer à « Résultat »')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
