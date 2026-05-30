import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface GardeData {
  user: { id: number; role: string };
  window_hours: number;
  since: string;
  patients_actifs: Array<{ id: number; nom: string; prenom: string; referenceId: string | null; telephone: string | null }>;
  labs_valides: Array<{ id: number; type_examen: string; date_examen: string; patient_id: number; patient_nom: string; patient_prenom: string; resultat: string | null }>;
  alertes_actives: Array<{ id: number; message: string; severite: string | null; type_alerte: string | null; patient_id: number; patient_nom: string; patient_prenom: string }>;
  hospitalisations_sorties: Array<{ id: number; statut: string; date_sortie: string | null; patient_id: number; patient_nom: string; patient_prenom: string }>;
  examens_urgents: Array<{ id: number; type_examen: string; statut: string; date_examen: string; patient_id: number; patient_nom: string; patient_prenom: string }>;
}

/**
 * Prise de garde — dashboard du médecin au début de service. Montre
 * en un coup d'œil : ses patients actifs, les résultats labo validés
 * depuis la dernière fois (par défaut 24h), les alertes en cours, les
 * sorties d'hospi dans son unité, les examens urgents en attente.
 *
 * Lookback ajustable : un médecin qui revient de vacances passe à 168h
 * (7 jours) via le bouton « 7 jours ». Un médecin de garde matinale
 * passe à 12h pour ne voir que la nuit.
 */
export default function Garde() {
  const navigate = useNavigate();
  const [data, setData] = useState<GardeData | null>(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<GardeData>('/dashboard/garde', { params: { hours } })
      .then(r => setData(r.data))
      .catch(err => console.error('[GARDE] load failed:', err))
      .finally(() => setLoading(false));
  }, [hours]);

  if (loading && !data) return <div className="loading"><div className="spinner"></div></div>;
  if (!data) return <div className="table-empty">Erreur de chargement</div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Prise de garde</span></nav>
      <div className="page-header">
        <h1 className="page-title">Prise de garde</h1>
        <div className="d-flex gap-1" role="group" aria-label="Fenêtre de regard">
          {[12, 24, 72, 168].map(h => (
            <button key={h} className={`btn-sm ${hours === h ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHours(h)}>
              {h < 24 ? `${h}h` : `${h / 24}j`}
            </button>
          ))}
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>
        Activité depuis le {new Date(data.since).toLocaleString('fr-FR')} ({data.window_hours}h).
      </p>

      <div className="grid-3 mb-3">
        <div className="tile stat-tile">
          <div className="stat-value">{data.patients_actifs.length}</div>
          <div className="stat-label">Patients sous votre responsabilité</div>
        </div>
        <div className="tile stat-tile">
          <div className="stat-value text-info">{data.labs_valides.length}</div>
          <div className="stat-label">Résultats labo validés</div>
        </div>
        <div className="tile stat-tile">
          <div className={`stat-value ${data.alertes_actives.length > 0 ? 'text-danger' : ''}`}>{data.alertes_actives.length}</div>
          <div className="stat-label">Alertes actives</div>
        </div>
      </div>

      {data.examens_urgents.length > 0 && (
        <div className="tile mb-3" style={{ padding: '1rem', borderLeft: '4px solid var(--cds-support-error)' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            <i className="bi bi-exclamation-octagon-fill text-danger"></i> Examens urgents en attente
          </h3>
          <table className="data-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Patient</th><th>Examen</th><th>Statut</th><th>Date</th></tr></thead>
            <tbody>
              {data.examens_urgents.map(e => (
                <tr key={e.id} onClick={() => navigate(`/app/patients/${e.patient_id}#examens`)} style={{ cursor: 'pointer' }}>
                  <td className="fw-600">{e.patient_prenom} {e.patient_nom}</td>
                  <td>{e.type_examen}</td>
                  <td><span className="tag tag-gray">{e.statut}</span></td>
                  <td>{new Date(e.date_examen).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.alertes_actives.length > 0 && (
        <div className="tile mb-3" style={{ padding: '1rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>Alertes patients</h3>
          {data.alertes_actives.map(a => (
            <div key={a.id} className={`notification notification-${a.severite === 'critical' || a.severite === 'danger' ? 'error' : 'warning'} mb-1`}>
              <i className="bi bi-bell-fill"></i>
              <div>
                <strong>{a.patient_prenom} {a.patient_nom}</strong>
                <span className="text-muted" style={{ marginLeft: '0.375rem', fontSize: '0.75rem' }}>{a.type_alerte}</span>
                <div style={{ fontSize: '0.8125rem' }}>{a.message}</div>
              </div>
              <button className="btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => navigate(`/app/patients/${a.patient_id}`)}>Ouvrir</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2 mb-3">
        <div className="tile" style={{ padding: '1rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>Résultats labo</h3>
          {data.labs_valides.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Aucun résultat dans la fenêtre.</p>
          ) : (
            data.labs_valides.map(l => (
              <div key={l.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--cds-ui-03)', cursor: 'pointer' }} onClick={() => navigate(`/app/patients/${l.patient_id}#examens`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                  <span className="fw-600">{l.patient_prenom} {l.patient_nom}</span>
                  <span className="text-muted" style={{ fontSize: '0.6875rem' }}>{new Date(l.date_examen).toLocaleDateString('fr-FR')}</span>
                </div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>{l.type_examen}</div>
                {l.resultat && <div style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>{l.resultat.substring(0, 120)}{l.resultat.length > 120 ? '…' : ''}</div>}
              </div>
            ))
          )}
        </div>

        <div className="tile" style={{ padding: '1rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>Mouvements unité</h3>
          {data.hospitalisations_sorties.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Aucun mouvement dans la fenêtre.</p>
          ) : (
            data.hospitalisations_sorties.map(h => (
              <div key={h.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--cds-ui-03)', cursor: 'pointer' }} onClick={() => navigate(`/app/patients/${h.patient_id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                  <span className="fw-600">{h.patient_prenom} {h.patient_nom}</span>
                  <span className={`tag ${h.statut === 'deces' ? 'tag-red' : h.statut === 'transfere' ? 'tag-orange' : 'tag-gray'}`} style={{ fontSize: '0.625rem' }}>{h.statut}</span>
                </div>
                <div className="text-muted" style={{ fontSize: '0.6875rem' }}>
                  {h.date_sortie ? new Date(h.date_sortie).toLocaleString('fr-FR') : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="tile" style={{ padding: '1rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>Mes patients</h3>
        {data.patients_actifs.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Aucun patient attribué actuellement.</p>
        ) : (
          <table className="data-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Patient</th><th>Référence</th><th>Téléphone</th></tr></thead>
            <tbody>
              {data.patients_actifs.map(p => (
                <tr key={p.id} onClick={() => navigate(`/app/patients/${p.id}`)} style={{ cursor: 'pointer' }}>
                  <td className="fw-600">{p.prenom} {p.nom}</td>
                  <td className="text-muted">{p.referenceId || '-'}</td>
                  <td>{p.telephone || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
