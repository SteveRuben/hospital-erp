import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createRendezVous, getMedecins, getServices,
  searchPatientsForOrdering, getMedecinCreneaux,
} from '../services/api';
import { coerceRdvPayload } from '../lib/formCoerce';
import { useSnackbar } from '../components/Snackbar';

interface PatientSuggestion {
  id: number; nom: string; prenom: string; telephone?: string | null;
  referenceId?: string | null;
}

export default function RendezVousForm() {
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();

  const [saving, setSaving] = useState(false);
  const [medecins, setMedecins] = useState<Array<{ id: number; nom: string; prenom: string; specialite?: string }>>([]);
  const [services, setServices] = useState<Array<{ id: number; nom: string }>>([]);
  const [form, setForm] = useState({
    patient_id: '', medecin_id: '', service_id: '',
    date_rdv: '', motif: '', notes: '', priorite: 'normal' as 'urgent' | 'prioritaire' | 'normal',
  });

  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<PatientSuggestion[]>([]);
  const [patientOpen, setPatientOpen] = useState(false);
  const patientTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [creneaux, setCreneaux] = useState<string[]>([]);
  const [loadingCreneaux, setLoadingCreneaux] = useState(false);

  const datePart = form.date_rdv ? form.date_rdv.split('T')[0] : '';

  useEffect(() => {
    getMedecins().then(r => setMedecins(r.data)).catch(() => {});
    getServices().then(r => setServices(r.data)).catch(() => {});
  }, []);

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

  const pickPatient = (p: PatientSuggestion) => {
    setForm(prev => ({ ...prev, patient_id: String(p.id) }));
    setPatientQuery(`${p.prenom} ${p.nom}`.trim());
    setPatientOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id) { showSnackbar('Sélectionnez un patient', 'warning'); return; }
    if (!form.medecin_id) { showSnackbar('Sélectionnez un médecin', 'warning'); return; }
    let payload: Record<string, unknown>;
    try { payload = coerceRdvPayload(form); }
    catch { showSnackbar('Champs requis manquants', 'warning'); return; }
    setSaving(true);
    try {
      await createRendezVous(payload);
      showSnackbar('Rendez-vous créé', 'success');
      navigate('/app/rendezvous');
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur lors de la création', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a>
        <span className="breadcrumb-separator">/</span>
        <a href="/app/rendezvous">Rendez-vous</a>
        <span className="breadcrumb-separator">/</span>
        <span>Nouveau rendez-vous</span>
      </nav>

      <div className="page-header">
        <h1 className="page-title">Nouveau rendez-vous</h1>
      </div>

      <div className="tile" style={{ maxWidth: '720px', padding: '1.5rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Patient *</label>
              <input
                type="text"
                className="form-input"
                value={patientQuery}
                placeholder="Tapez 2 lettres du nom, prénom ou référence"
                onChange={e => {
                  setPatientQuery(e.target.value);
                  setPatientOpen(true);
                  if (form.patient_id) setForm(f => ({ ...f, patient_id: '' }));
                }}
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
                      onMouseDown={e => { e.preventDefault(); pickPatient(p); }}
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

            <div className="form-group">
              <label className="form-label">Médecin *</label>
              <select
                className="form-select"
                value={form.medecin_id}
                onChange={e => setForm({ ...form, medecin_id: e.target.value })}
              >
                <option value="">Sélectionner...</option>
                {medecins.map(m => (
                  <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Service</label>
              <select
                className="form-select"
                value={form.service_id}
                onChange={e => setForm({ ...form, service_id: e.target.value })}
              >
                <option value="">Sélectionner...</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date et heure *</label>
              <input
                type="datetime-local"
                className="form-input"
                value={form.date_rdv}
                onChange={e => setForm({ ...form, date_rdv: e.target.value })}
                required
              />
            </div>
          </div>

          {form.medecin_id && datePart && (
            <div className="form-group">
              <label className="form-label">Créneaux libres du médecin</label>
              {loadingCreneaux ? (
                <div className="text-muted" style={{ fontSize: '0.8125rem' }}>Chargement…</div>
              ) : creneaux.length === 0 ? (
                <div className="notification notification-warning" style={{ fontSize: '0.8125rem' }}>
                  <i className="bi bi-exclamation-triangle"></i>
                  <span>Aucun créneau libre ce jour.</span>
                </div>
              ) : (
                <>
                  {(['Matin', 'Après-midi'] as const).map((titre, i) => {
                    const list = creneaux.filter(c => i === 0 ? c < '12:00' : c >= '12:00');
                    if (list.length === 0) return null;
                    return (
                      <div key={titre} style={{ marginBottom: '0.5rem' }}>
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
                  })}
                </>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Motif</label>
            <input
              type="text"
              className="form-input"
              value={form.motif}
              onChange={e => setForm({ ...form, motif: e.target.value })}
              placeholder="Motif de la consultation"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Priorité</label>
            <div className="d-flex gap-1" role="radiogroup" aria-label="Priorité">
              {(['urgent', 'prioritaire', 'normal'] as const).map(p => {
                const active = form.priorite === p;
                const colour = p === 'urgent' ? 'var(--cds-support-error)' : p === 'prioritaire' ? 'var(--cds-support-warning)' : 'var(--cds-ui-03)';
                return (
                  <button
                    type="button"
                    key={p}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setForm({ ...form, priorite: p })}
                    style={{ padding: '0.375rem 0.875rem', cursor: 'pointer', border: `2px solid ${active ? colour : 'var(--cds-ui-03)'}`, background: active ? colour : 'transparent', color: active ? '#fff' : 'inherit', fontSize: '0.8125rem', textTransform: 'capitalize' }}
                  >
                    {p === 'urgent' && <i className="bi bi-exclamation-octagon" style={{ marginRight: '0.25rem' }}></i>}
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="d-flex gap-1" style={{ marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/rendezvous')}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Création…' : 'Planifier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
