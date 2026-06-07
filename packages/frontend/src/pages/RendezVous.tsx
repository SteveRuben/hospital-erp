import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getRendezVous, createRendezVous, updateRendezVousStatut, deleteRendezVous, getMedecins, getServices, searchPatientsForOrdering, getPatient, getMedecinCreneaux } from '../services/api';
import { coerceRdvPayload } from '../lib/formCoerce';
import type { RendezVous as RDV, Medecin, Service } from '../types';

interface PatientSuggestion {
  id: number; nom: string; prenom: string; telephone?: string | null;
  referenceId?: string | null;
}

const statutConfig: Record<string, { label: string; tag: string }> = {
  planifie: { label: 'Planifié', tag: 'tag-gray' },
  confirme: { label: 'Confirmé', tag: 'tag-blue' },
  en_cours: { label: 'En cours', tag: 'tag-yellow' },
  termine: { label: 'Terminé', tag: 'tag-green' },
  annule: { label: 'Annulé', tag: 'tag-red' },
  absent: { label: 'Absent', tag: 'tag-orange' },
};

export default function RendezVous() {
  const [rdvs, setRdvs] = useState<RDV[]>([]);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ patient_id: '', medecin_id: '', service_id: '', date_rdv: '', motif: '', notes: '', priorite: 'normal' as 'urgent' | 'prioritaire' | 'normal' });

  // Créneaux libres du médecin sélectionné pour la date choisie. Chargés quand
  // médecin + date sont renseignés ; cliquer une puce remplit l'heure.
  const [creneaux, setCreneaux] = useState<string[]>([]);
  const [loadingCreneaux, setLoadingCreneaux] = useState(false);
  const datePart = form.date_rdv ? form.date_rdv.split('T')[0] : '';
  useEffect(() => {
    if (!form.medecin_id || !datePart) { setCreneaux([]); return; }
    let alive = true;
    setLoadingCreneaux(true);
    getMedecinCreneaux(Number(form.medecin_id), datePart)
      .then(r => { if (alive) setCreneaux(r.data.creneaux); })
      .catch(() => { if (alive) setCreneaux([]); })
      .finally(() => { if (alive) setLoadingCreneaux(false); });
    return () => { alive = false; };
  }, [form.medecin_id, datePart]);

  // Patient typeahead state — replaces the old dropdown that loaded every
  // patient at once. Lets the receptionist find anyone by name or reference,
  // including patients they don't manage day to day.
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<PatientSuggestion[]>([]);
  const [patientOpen, setPatientOpen] = useState(false);
  const patientTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [searchParams] = useSearchParams();
  useEffect(() => { loadData(); }, []);

  // Deep-link from PatientDetail's RDV shortcut. The URL carries
  // ?new=1&patient_id=N — we hydrate the patient name, pre-fill the
  // form, and pop the create modal open in one go.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    const pid = searchParams.get('patient_id');
    if (!pid) { setShowModal(true); return; }
    getPatient(Number(pid))
      .then(({ data }) => {
        const p = data as any;
        const label = `${p.prenom ?? ''} ${p.nom ?? ''}`.trim();
        setForm(f => ({ ...f, patient_id: String(p.id) }));
        setPatientQuery(label);
        setShowModal(true);
      })
      .catch(() => setShowModal(true));
  }, [searchParams]);

  // Debounced server-side search — 200ms so each keystroke doesn't fire.
  useEffect(() => {
    if (patientTimer.current) clearTimeout(patientTimer.current);
    if (!patientQuery || patientQuery.length < 2) { setPatientResults([]); return; }
    patientTimer.current = setTimeout(() => {
      searchPatientsForOrdering(patientQuery)
        .then(({ data }) => setPatientResults(data as PatientSuggestion[]))
        .catch(() => setPatientResults([]));
    }, 200);
    return () => { if (patientTimer.current) clearTimeout(patientTimer.current); };
  }, [patientQuery]);

  const loadData = async () => {
    try {
      const [r, m, s] = await Promise.all([getRendezVous(), getMedecins(), getServices()]);
      setRdvs(r.data); setMedecins(m.data); setServices(s.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ patient_id: '', medecin_id: '', service_id: '', date_rdv: '', motif: '', notes: '', priorite: 'normal' });
    setPatientQuery('');
    setPatientResults([]);
  };

  const pickPatient = (p: PatientSuggestion) => {
    setForm(prev => ({ ...prev, patient_id: String(p.id) }));
    setPatientQuery(`${p.prenom} ${p.nom}`.trim());
    setPatientOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id) { alert('Sélectionnez un patient dans la liste'); return; }
    if (!form.medecin_id) { alert('Sélectionnez un médecin'); return; }
    // Coercion lives in src/lib/formCoerce so unit tests pin the
    // behaviour. Patient/medecin guards above mean the throw inside
    // the helper is unreachable from this path.
    let payload: Record<string, unknown>;
    try { payload = coerceRdvPayload(form); }
    catch { alert('Champs requis manquants'); return; }
    try { await createRendezVous(payload); setShowModal(false); resetForm(); loadData(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erreur lors de la création du rendez-vous'); }
  };

  const changeStatut = async (id: number, statut: string) => {
    try { await updateRendezVousStatut(id, statut); loadData(); } catch { alert('Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const today = new Date().toISOString().split('T')[0];
  const rdvsToday = rdvs.filter(r => r.date_rdv.startsWith(today));
  const rdvsUpcoming = rdvs.filter(r => r.date_rdv > today);

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Rendez-vous</span></nav>
      <div className="page-header"><h1 className="page-title">Rendez-vous</h1><button className="btn-primary" onClick={() => setShowModal(true)}><i className="bi bi-plus"></i> Nouveau RDV</button></div>

      <div className="grid-4 mb-3">
        <div className="tile stat-tile"><div className="stat-value">{rdvsToday.length}</div><div className="stat-label">Aujourd'hui</div></div>
        <div className="tile stat-tile"><div className="stat-value">{rdvsToday.filter(r => r.statut === 'confirme').length}</div><div className="stat-label">Confirmés</div></div>
        <div className="tile stat-tile"><div className="stat-value">{rdvsToday.filter(r => r.statut === 'en_cours').length}</div><div className="stat-label">En cours</div></div>
        <div className="tile stat-tile"><div className="stat-value">{rdvsUpcoming.length}</div><div className="stat-label">À venir</div></div>
      </div>

      <div className="tabs mb-2">
        <button className="tab-item active">Aujourd'hui</button>
      </div>

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
                  <button className="btn-icon" onClick={async () => { if (confirm('Supprimer ?')) { await deleteRendezVous(r.id); loadData(); }}}><i className="bi bi-trash"></i></button>
                </div>
              </td>
            </tr>
          ))}
          {rdvs.length === 0 && <tr><td colSpan={7} className="table-empty"><i className="bi bi-calendar-event"></i>Aucun rendez-vous</td></tr>}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Nouveau rendez-vous</h3><button className="btn-icon" onClick={() => { setShowModal(false); resetForm(); }}><i className="bi bi-x-lg"></i></button></div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="grid-2">
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label className="form-label">Patient * <span className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 400 }}>(nom ou référence)</span></label>
                    <input
                      type="text"
                      className="form-input"
                      value={patientQuery}
                      placeholder="Tapez 2 lettres du nom, prénom ou référence (PAT-…)"
                      onChange={e => { setPatientQuery(e.target.value); setPatientOpen(true); if (form.patient_id) setForm(f => ({ ...f, patient_id: '' })); }}
                      onFocus={() => setPatientOpen(true)}
                      onBlur={() => setTimeout(() => setPatientOpen(false), 150)}
                      required={!form.patient_id}
                      autoFocus
                    />
                    {form.patient_id && (
                      <div className="text-muted" style={{ fontSize: '0.6875rem', marginTop: '0.25rem' }}>
                        <i className="bi bi-check-circle"></i> patient sélectionné (#{form.patient_id})
                      </div>
                    )}
                    {patientOpen && patientResults.length > 0 && (
                      <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2, background: 'var(--cds-ui-02)', border: '1px solid var(--cds-ui-03)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: '260px', overflowY: 'auto' }}>
                        {patientResults.map(p => (
                          <div
                            key={p.id}
                            onMouseDown={(e) => { e.preventDefault(); pickPatient(p); }}
                            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', borderBottom: '1px solid var(--cds-ui-03)' }}
                          >
                            <strong>{p.prenom} {p.nom}</strong>
                            {p.referenceId && <span className="text-muted" style={{ marginLeft: '0.5rem' }}>{p.referenceId}</span>}
                            {p.telephone && <span className="text-muted" style={{ marginLeft: '0.5rem' }}>{p.telephone}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="form-group"><label className="form-label">Médecin</label><select className="form-select" value={form.medecin_id} onChange={e => setForm({...form, medecin_id: e.target.value})}><option value="">Sélectionner...</option>{medecins.map(m => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>)}</select></div>
                </div>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Service</label><select className="form-select" value={form.service_id} onChange={e => setForm({...form, service_id: e.target.value})}><option value="">Sélectionner...</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Date et heure *</label><input type="datetime-local" className="form-input" value={form.date_rdv} onChange={e => setForm({...form, date_rdv: e.target.value})} required /></div>
                </div>
                {form.medecin_id && datePart && (
                  <div className="form-group">
                    <label className="form-label">Créneaux libres du médecin</label>
                    {loadingCreneaux ? (
                      <div className="text-muted" style={{ fontSize: '0.8125rem' }}>Chargement…</div>
                    ) : creneaux.length === 0 ? (
                      <div className="notification notification-warning" style={{ fontSize: '0.8125rem' }}>
                        <i className="bi bi-exclamation-triangle"></i>
                        <span>Aucun créneau libre ce jour (médecin absent, agenda non défini, ou journée complète).</span>
                      </div>
                    ) : (
                      (() => {
                        const renderGroup = (titre: string, list: string[]) => list.length === 0 ? null : (
                          <div style={{ marginBottom: '0.5rem' }}>
                            <div className="text-muted" style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.25rem' }}>{titre}</div>
                            <div className="d-flex gap-1" style={{ flexWrap: 'wrap' }}>
                              {list.map(c => {
                                const active = form.date_rdv === `${datePart}T${c}`;
                                return (
                                  <button
                                    type="button"
                                    key={c}
                                    className={active ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
                                    onClick={() => setForm(f => ({ ...f, date_rdv: `${datePart}T${c}` }))}
                                  >
                                    {c}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                        return (
                          <>
                            {renderGroup('Matin', creneaux.filter(c => c < '12:00'))}
                            {renderGroup('Après-midi', creneaux.filter(c => c >= '12:00'))}
                          </>
                        );
                      })()
                    )}
                  </div>
                )}
                <div className="form-group"><label className="form-label">Motif</label><input type="text" className="form-input" value={form.motif} onChange={e => setForm({...form, motif: e.target.value})} /></div>
                <div className="form-group">
                  <label className="form-label">Priorité</label>
                  <div className="d-flex gap-1" role="radiogroup" aria-label="Priorité">
                    {(['urgent','prioritaire','normal'] as const).map(p => {
                      const active = form.priorite === p;
                      const colour = p === 'urgent' ? 'var(--cds-support-error)' : p === 'prioritaire' ? 'var(--cds-support-warning)' : 'var(--cds-ui-03)';
                      return (
                        <button type="button" key={p} role="radio" aria-checked={active}
                          onClick={() => setForm({...form, priorite: p})}
                          style={{ padding: '0.375rem 0.875rem', cursor: 'pointer', border: `2px solid ${active ? colour : 'var(--cds-ui-03)'}`, background: active ? colour : 'transparent', color: active ? '#fff' : 'inherit', fontSize: '0.8125rem', textTransform: 'capitalize' }}>
                          {p === 'urgent' && <i className="bi bi-exclamation-octagon" style={{ marginRight: '0.25rem' }}></i>}
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>Annuler</button><button type="submit" className="btn-primary">Planifier</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}