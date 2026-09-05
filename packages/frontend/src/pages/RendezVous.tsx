import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getRendezVous, updateRendezVousStatut, deleteRendezVous, getMedecins, getServices, getMedecinCreneaux } from '../services/api';
import type { RendezVous as RDV, Medecin, Service } from '../types';
import { useSnackbar } from '../components/Snackbar';
import { useConfirm } from '../components/ConfirmDialog';

const statutConfig: Record<string, { label: string; tag: string }> = {
  planifie: { label: 'Planifié', tag: 'tag-gray' },
  confirme: { label: 'Confirmé', tag: 'tag-blue' },
  en_cours: { label: 'En cours', tag: 'tag-yellow' },
  termine: { label: 'Terminé', tag: 'tag-green' },
  annule: { label: 'Annulé', tag: 'tag-red' },
  absent: { label: 'Absent', tag: 'tag-orange' },
};

export default function RendezVous() {
  const navigate = useNavigate();
  const [rdvs, setRdvs] = useState<RDV[]>([]);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const { showSnackbar } = useSnackbar();
  const { confirm } = useConfirm();

  // Vue : liste classique ou planning (médecins × RDV + disponibilités d'un jour).
  const [view, setView] = useState<'liste' | 'planning'>('liste');
  const [planningDate, setPlanningDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [planningSlots, setPlanningSlots] = useState<Record<number, string[]>>({});
  const [loadingPlanning, setLoadingPlanning] = useState(false);

  // Planning : créneaux libres de chaque médecin pour la date choisie.
  useEffect(() => {
    if (view !== 'planning' || medecins.length === 0) { return; }
    let alive = true;
    setLoadingPlanning(true);
    Promise.all(medecins.map(m =>
      getMedecinCreneaux(m.id, planningDate)
        .then(r => [m.id, r.data.creneaux] as const)
        .catch(() => [m.id, [] as string[]] as const),
    ))
      .then(entries => { if (alive) setPlanningSlots(Object.fromEntries(entries)); })
      .finally(() => { if (alive) setLoadingPlanning(false); });
    return () => { alive = false; };
  }, [view, planningDate, medecins]);

  const [searchParams] = useSearchParams();
  useEffect(() => { loadData(); }, []);

  // Deep-link from PatientDetail's RDV shortcut. The URL carries
  // ?new=1&patient_id=N — redirect to the new RDV page with the patient prefilled.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    const pid = searchParams.get('patient_id');
    if (pid) {
      navigate(`/app/rendezvous/nouveau?patient_id=${pid}`);
    } else {
      navigate('/app/rendezvous/nouveau');
    }
  }, [searchParams, navigate]);

  const loadData = async () => {
    try {
      const [r, m, s] = await Promise.all([getRendezVous(), getMedecins(), getServices()]);
      setRdvs(r.data); setMedecins(m.data); setServices(s.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const changeStatut = async (id: number, statut: string) => {
    try { await updateRendezVousStatut(id, statut); loadData(); } catch { showSnackbar('Erreur', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const today = new Date().toISOString().split('T')[0];
  const rdvsToday = rdvs.filter(r => r.date_rdv.startsWith(today));
  const rdvsUpcoming = rdvs.filter(r => r.date_rdv > today);

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Rendez-vous</span></nav>
      <div className="page-header"><h1 className="page-title">Rendez-vous</h1><button className="btn-primary" onClick={() => navigate('/app/rendezvous/nouveau')}><i className="bi bi-plus"></i> Nouveau RDV</button></div>

      <div className="grid-4 mb-3">
        <div className="tile stat-tile"><div className="stat-value">{rdvsToday.length}</div><div className="stat-label">Aujourd'hui</div></div>
        <div className="tile stat-tile"><div className="stat-value">{rdvsToday.filter(r => r.statut === 'confirme').length}</div><div className="stat-label">Confirmés</div></div>
        <div className="tile stat-tile"><div className="stat-value">{rdvsToday.filter(r => r.statut === 'en_cours').length}</div><div className="stat-label">En cours</div></div>
        <div className="tile stat-tile"><div className="stat-value">{rdvsUpcoming.length}</div><div className="stat-label">À venir</div></div>
      </div>

      <div className="tabs mb-2">
        <button className={`tab-item ${view === 'liste' ? 'active' : ''}`} onClick={() => setView('liste')}>Liste</button>
        <button className={`tab-item ${view === 'planning' ? 'active' : ''}`} onClick={() => setView('planning')}>Planning</button>
      </div>

      {view === 'planning' && (
        <div className="tile" style={{ padding: '1.25rem' }}>
          <div className="d-flex gap-1 mb-2" style={{ alignItems: 'center' }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Jour</label>
            <input type="date" className="form-input" style={{ width: '170px' }} value={planningDate} onChange={e => setPlanningDate(e.target.value)} />
            {loadingPlanning && <span className="text-muted" style={{ fontSize: '0.8125rem' }}>Chargement…</span>}
          </div>
          {(() => {
            const dayRdvs = rdvs.filter(r => String(r.date_rdv).startsWith(planningDate));
            return medecins.map(m => {
              const booked = dayRdvs
                .filter(r => (r as any).medecin_id === m.id && r.statut !== 'annule')
                .sort((a, b) => new Date(a.date_rdv).getTime() - new Date(b.date_rdv).getTime());
              const free = planningSlots[m.id] ?? [];
              return (
                <div key={m.id} style={{ display: 'flex', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid var(--cds-ui-03)', alignItems: 'flex-start' }}>
                  <div style={{ width: '160px', fontWeight: 600, fontSize: '0.8125rem', paddingTop: '0.25rem' }}>Dr {m.prenom} {m.nom}</div>
                  <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {booked.length === 0 && free.length === 0 && (
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>Indisponible / aucun agenda ce jour</span>
                    )}
                    {booked.map(r => (
                      <span key={r.id} className="tag tag-blue" style={{ fontSize: '0.6875rem' }} title={`${r.patient_prenom ?? ''} ${r.patient_nom ?? ''} — ${statutConfig[r.statut]?.label ?? r.statut}`}>
                        <i className="bi bi-calendar-check"></i> {new Date(r.date_rdv).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} {r.patient_prenom} {r.patient_nom}
                      </span>
                    ))}
                    {free.map(c => (
                      <span key={c} className="tag tag-green" style={{ fontSize: '0.6875rem', opacity: 0.85 }} title="Créneau libre">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
          {medecins.length === 0 && <div className="text-muted" style={{ fontSize: '0.8125rem' }}>Aucun médecin.</div>}
          <div className="text-muted" style={{ fontSize: '0.6875rem', marginTop: '0.75rem' }}>
            <span className="tag tag-blue" style={{ fontSize: '0.625rem' }}>RDV</span> rendez-vous pris &nbsp;
            <span className="tag tag-green" style={{ fontSize: '0.625rem' }}>libre</span> créneau disponible
          </div>
        </div>
      )}

      {view === 'liste' && (
      <table className="data-table">
        <thead><tr><th>Heure</th><th>Patient</th><th>Médecin</th><th>Service</th><th>Motif</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          {rdvs.map(r => (
            <tr key={r.id}>
              <td>
                {new Date(r.date_rdv).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                {(r as any).priorite === 'urgent' && <span className="tag tag-red" style={{ marginLeft: '0.375rem', fontSize: '0.5625rem' }}>URGENT</span>}
                {(r as any).priorite === 'prioritaire' && <span className="tag tag-orange" style={{ marginLeft: '0.375rem', fontSize: '0.5625rem' }}>prio.</span>}
              </td>
              <td>{r.patient_prenom} {r.patient_nom}</td>
              <td>Dr. {r.medecin_prenom} {r.medecin_nom}</td>
              <td>{r.service_nom}</td>
              <td>{r.motif || '-'}</td>
              <td><span className={`tag ${statutConfig[r.statut]?.tag}`}>{statutConfig[r.statut]?.label}</span></td>
              <td>
                <div className="d-flex gap-1">
                  {r.statut === 'planifie' && <button className="btn-ghost btn-sm" onClick={() => changeStatut(r.id, 'confirme')}>Confirmer</button>}
                  {r.statut === 'confirme' && <button className="btn-ghost btn-sm" onClick={() => changeStatut(r.id, 'en_cours')}>Démarrer</button>}
                  {r.statut === 'en_cours' && <button className="btn-ghost btn-sm" onClick={() => changeStatut(r.id, 'termine')}>Terminer</button>}
                  {['planifie', 'confirme'].includes(r.statut) && <button className="btn-ghost btn-sm text-danger" onClick={() => changeStatut(r.id, 'annule')}>Annuler</button>}
                  <button className="btn-icon" onClick={async () => { const ok = await confirm({ message: 'Supprimer ce rendez-vous ?', variant: 'danger' }); if (ok) { await deleteRendezVous(r.id); loadData(); }}}><i className="bi bi-trash"></i></button>
                </div>
              </td>
            </tr>
          ))}
          {rdvs.length === 0 && <tr><td colSpan={7} className="table-empty"><i className="bi bi-calendar-event"></i>Aucun rendez-vous</td></tr>}
        </tbody>
      </table>
      )}
    </div>
  );
}