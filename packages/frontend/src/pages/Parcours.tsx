import { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../App';
import {
  getParcours, getParcoursStats, updateParcoursStatut, deleteParcours,
  type ParcoursRow,
} from '../services/api';
import { useSnackbar } from '../components/Snackbar';
import { useConfirm } from '../components/ConfirmDialog';

// Care-journey steps. Order drives the Kanban columns left → right.
const STATUTS = ['triage', 'consultation', 'examens', 'traitement', 'sortie'] as const;
type Statut = typeof STATUTS[number];

const statutLabels: Record<Statut, { label: string; tag: string; icon: string }> = {
  triage:       { label: 'Triage',       tag: 'tag-orange', icon: 'bi-clipboard-pulse' },
  consultation: { label: 'Consultation', tag: 'tag-blue',   icon: 'bi-person-vcard' },
  examens:      { label: 'Examens',      tag: 'tag-purple', icon: 'bi-flask' },
  traitement:   { label: 'Traitement',   tag: 'tag-yellow', icon: 'bi-capsule' },
  sortie:       { label: 'Sortie',       tag: 'tag-green',  icon: 'bi-box-arrow-right' },
};

// Forward / backward step for the action buttons. The backend state machine
// allows a few extra jumps (examens ↔ consultation), but the buttons drive the
// happy path; admins get the back arrow for corrections.
const nextStatut: Record<Statut, Statut | null> = {
  triage: 'consultation',
  consultation: 'examens',
  examens: 'traitement',
  traitement: 'sortie',
  sortie: null,
};
const nextAction: Record<Statut, string> = {
  triage: 'Vers consultation',
  consultation: 'Vers examens',
  examens: 'Vers traitement',
  traitement: 'Sortie',
  sortie: '',
};
const prevStatut: Record<Statut, Statut | null> = {
  triage: null,
  consultation: 'triage',
  examens: 'consultation',
  traitement: 'examens',
  sortie: 'traitement',
};

const prioStyle: Record<string, React.CSSProperties | undefined> = {
  urgent: { borderLeft: '4px solid var(--cds-support-error)' },
  prioritaire: { borderLeft: '4px solid var(--cds-support-warning)' },
  normal: undefined,
};

function ageFromDob(dob: string | null): string {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return '';
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return years >= 0 && years < 130 ? `${years} ans` : '';
}

export default function Parcours() {
  const [rows, setRows] = useState<ParcoursRow[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const { confirm } = useConfirm();
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';

  const load = useCallback(async () => {
    try {
      // Pull the full board incl. 'sortie' so the last column isn't empty;
      // limit is generous since this is the daily working set.
      const [list, st] = await Promise.all([
        getParcours({ limit: 200 }),
        getParcoursStats(),
      ]);
      // The list endpoint excludes 'sortie' by default — fetch it separately so
      // the Sortie column shows recently discharged patients.
      const sorties = await getParcours({ statut: 'sortie', limit: 50 });
      setRows([...list.data.data, ...sorties.data.data]);
      setStats(st.data);
    } catch (err) {
      console.error(err);
      showSnackbar('Erreur lors du chargement du parcours', 'error');
    } finally {
      setLoading(false);
    }
  }, [showSnackbar]);

  useEffect(() => { load(); }, [load]);

  const move = async (p: ParcoursRow, to: Statut) => {
    try {
      await updateParcoursStatut(p.id, to);
      showSnackbar(`${p.patient_prenom} ${p.patient_nom} → ${statutLabels[to].label}`, 'success');
      load();
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Transition refusée', 'error');
    }
  };

  const remove = async (p: ParcoursRow) => {
    const ok = await confirm({ title: 'Retirer du parcours', message: `Retirer ${p.patient_prenom} ${p.patient_nom} du tableau de suivi ?`, confirmLabel: 'Retirer', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteParcours(p.id);
      load();
    } catch { showSnackbar('Suppression impossible', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const cardsFor = (s: Statut) => rows.filter(r => r.statut === s);
  const activeCount = rows.filter(r => r.statut !== 'sortie').length;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Parcours patients</span></nav>
      <div className="page-header">
        <h1 className="page-title">Parcours patients</h1>
        <button className="btn-primary" onClick={() => navigate('/app/patients/nouveau')}>
          <i className="bi bi-person-plus"></i> Nouveau patient
        </button>
      </div>

      <div className="grid-3 mb-3">
        <div className="tile stat-tile"><div className="stat-value">{activeCount}</div><div className="stat-label">Patients en cours</div></div>
        <div className="tile stat-tile"><div className="stat-value text-warning">{stats.triage ?? 0}</div><div className="stat-label">En triage</div></div>
        <div className="tile stat-tile"><div className="stat-value text-success">{stats.sortie ?? 0}</div><div className="stat-label">Sortis</div></div>
      </div>

      <div className="kanban">
        {STATUTS.map(s => {
          const items = cardsFor(s);
          return (
            <div className="kanban-column" key={s}>
              <div className="kanban-column-header">
                <span><i className={`bi ${statutLabels[s].icon}`}></i> {statutLabels[s].label}</span>
                <span className="count">{items.length}</span>
              </div>
              {items.map(p => {
                const prio = (p.priorite || 'normal') as keyof typeof prioStyle;
                const age = ageFromDob(p.patient_date_naissance);
                const next = nextStatut[s];
                const prev = prevStatut[s];
                return (
                  <div className="kanban-card" key={p.id} style={prioStyle[prio]}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h4 style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/patients/${p.patient_id}`)}>
                        {p.patient_prenom} {p.patient_nom}
                      </h4>
                      {prio === 'urgent' && <span className="tag tag-red" style={{ fontSize: '0.5625rem', whiteSpace: 'nowrap' }}><i className="bi bi-exclamation-octagon-fill"></i> URGENT</span>}
                      {prio === 'prioritaire' && <span className="tag tag-orange" style={{ fontSize: '0.5625rem', whiteSpace: 'nowrap' }}>prioritaire</span>}
                    </div>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>
                      {p.patient_reference || `#${p.patient_id}`}{age ? ` · ${age}` : ''}{p.patient_sexe ? ` · ${p.patient_sexe}` : ''}
                    </p>
                    {p.motif && <p style={{ fontSize: '0.75rem' }}>{p.motif}</p>}
                    {p.medecin_nom && (
                      <p style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>
                        <i className="bi bi-person-badge"></i> Dr {p.medecin_prenom} {p.medecin_nom}
                      </p>
                    )}
                    {p.service_nom && (
                      <p style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>
                        <i className="bi bi-diagram-3"></i> {p.service_nom}
                      </p>
                    )}
                    <div className="d-flex gap-1 mt-1" style={{ flexWrap: 'wrap' }}>
                      {next && (
                        <button className="btn-primary btn-sm" onClick={() => move(p, next)}>
                          {nextAction[s]} →
                        </button>
                      )}
                      {isAdmin && prev && (
                        <button className="btn-ghost btn-sm" style={{ color: 'var(--cds-text-secondary)' }} title="Étape précédente" onClick={() => move(p, prev)}>
                          ← {statutLabels[prev].label}
                        </button>
                      )}
                      {isAdmin && (
                        <button className="btn-icon" title="Retirer" onClick={() => remove(p)}>
                          <i className="bi bi-trash"></i>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', textAlign: 'center', padding: '1rem 0' }}>—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
