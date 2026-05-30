import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createExamen, updateExamen, getExamen, quickSearchPatients,
  getExamenTypesForPatient, getTarifsByCategorie, type TarifRow,
} from '../services/api';

/**
 * Examen creation/edit form.
 *
 * Improvements over the original select-of-everything form:
 *   - Patient typeahead by name OR reference (PAT-…). No more 1000-row select.
 *   - Type d'examen as a combobox: free typing + suggestions drawn from the
 *     standard list AND the patient's previous exam types. Picking from
 *     either is a one-click insertion.
 *   - Montant auto-fills from the configured Tarif catalogue when the type
 *     matches (case-insensitive libellé). Manual override is still possible.
 */

interface PatientSuggestion {
  id: number; nom: string; prenom: string; telephone?: string | null;
  referenceId?: string | null;
}

const standardTypes = [
  'Analyse de sang', "Analyse d'urine", 'Glycémie', 'Créatinine',
  'Urée', 'Cholestérol', 'Groupe sanguin', 'Sérologie',
  'Test de grossesse', 'NFS', 'CRP', 'TSH',
];

export default function ExamenForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState({
    patient_id: '',
    patient_label: '',
    type_examen: '',
    resultat: '',
    date_examen: new Date().toISOString().substring(0, 10),
    montant: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Patient typeahead
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<PatientSuggestion[]>([]);
  const [patientOpen, setPatientOpen] = useState(false);
  const patientTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Type d'examen combobox
  const [typeOpen, setTypeOpen] = useState(false);
  const [patientHistory, setPatientHistory] = useState<string[]>([]);

  // Tarif catalogue for autofill
  const [tarifs, setTarifs] = useState<TarifRow[]>([]);

  // Load existing exam (edit mode) + tarif catalogue (always)
  useEffect(() => {
    Promise.all([
      isEdit ? getExamen(Number(id)) : Promise.resolve(null),
      getTarifsByCategorie('examen').catch(() => ({ data: [] })),
    ]).then(([e, t]) => {
      setTarifs(t.data ?? []);
      if (e?.data) {
        const d = e.data as any;
        const label = d.patient_prenom || d.patient_nom
          ? `${d.patient_prenom ?? ''} ${d.patient_nom ?? ''}`.trim()
          : String(d.patient_id ?? '');
        setForm({
          patient_id: String(d.patient_id ?? ''),
          patient_label: label,
          type_examen: d.type_examen ?? '',
          resultat: d.resultat ?? '',
          date_examen: d.date_examen ? String(d.date_examen).split('T')[0] : '',
          montant: d.montant != null ? String(d.montant) : '',
        });
        setPatientQuery(label);
      }
    }).catch(() => setError('Erreur de chargement')).finally(() => setLoading(false));
  }, [id, isEdit]);

  // Whenever the patient changes, refresh the "previously ordered types" list
  useEffect(() => {
    if (!form.patient_id) { setPatientHistory([]); return; }
    getExamenTypesForPatient(Number(form.patient_id))
      .then(({ data }) => setPatientHistory(data))
      .catch(() => setPatientHistory([]));
  }, [form.patient_id]);

  // Patient typeahead — debounced 200ms server-side search
  useEffect(() => {
    if (patientTimer.current) clearTimeout(patientTimer.current);
    if (!patientQuery || patientQuery.length < 2) { setPatientResults([]); return; }
    patientTimer.current = setTimeout(() => {
      quickSearchPatients(patientQuery)
        .then(({ data }) => setPatientResults(data))
        .catch(() => setPatientResults([]));
    }, 200);
    return () => { if (patientTimer.current) clearTimeout(patientTimer.current); };
  }, [patientQuery]);

  const pickPatient = (p: PatientSuggestion) => {
    const label = `${p.prenom} ${p.nom}`.trim();
    setForm(f => ({ ...f, patient_id: String(p.id), patient_label: label }));
    setPatientQuery(label);
    setPatientOpen(false);
  };

  // When the user picks (or types) a type, look up the matching tarif and
  // auto-fill montant if we haven't already manually overridden it.
  const applyTypeAutofill = (newType: string) => {
    const tarif = tarifs.find(t => t.libelle.toLowerCase() === newType.toLowerCase());
    setForm(f => ({
      ...f,
      type_examen: newType,
      montant: tarif ? String(tarif.montant) : f.montant,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id) { setError('Sélectionnez un patient dans la liste'); return; }
    if (!form.type_examen.trim()) { setError("Type d'examen requis"); return; }
    setError('');
    const payload = {
      patient_id: form.patient_id,
      type_examen: form.type_examen.trim(),
      resultat: form.resultat,
      date_examen: form.date_examen,
      montant: form.montant === '' ? null : Number(form.montant),
    };
    try {
      if (isEdit) await updateExamen(Number(id), payload);
      else await createExamen(payload);
      navigate('/app/laboratoire');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
  };

  // Suggestions for the type combobox: history first (most relevant to this
  // patient), then standard list. Filter by current input.
  const typeSuggestions = (() => {
    const seen = new Set<string>();
    const ordered: Array<{ value: string; source: 'history' | 'standard' }> = [];
    for (const h of patientHistory) {
      const k = h.toLowerCase();
      if (!seen.has(k)) { seen.add(k); ordered.push({ value: h, source: 'history' }); }
    }
    for (const s of standardTypes) {
      const k = s.toLowerCase();
      if (!seen.has(k)) { seen.add(k); ordered.push({ value: s, source: 'standard' }); }
    }
    const q = form.type_examen.trim().toLowerCase();
    return q ? ordered.filter(o => o.value.toLowerCase().includes(q)) : ordered;
  })();

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/laboratoire">Laboratoire</a><span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier' : 'Nouvel examen'}</span>
      </nav>
      <div className="page-header"><h1 className="page-title">{isEdit ? "Modifier l'examen" : 'Nouvel examen'}</h1></div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            {/* Patient typeahead */}
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

            {/* Type d'examen combobox */}
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Type d'examen *</label>
              <input
                type="text"
                className="form-input"
                value={form.type_examen}
                placeholder="Tapez ou choisissez dans la liste"
                onChange={e => { applyTypeAutofill(e.target.value); setTypeOpen(true); }}
                onFocus={() => setTypeOpen(true)}
                onBlur={() => setTimeout(() => setTypeOpen(false), 150)}
                required
              />
              {typeOpen && typeSuggestions.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2, background: 'var(--cds-ui-02)', border: '1px solid var(--cds-ui-03)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: '260px', overflowY: 'auto' }}>
                  {typeSuggestions.slice(0, 12).map((sug, i) => {
                    const tarif = tarifs.find(t => t.libelle.toLowerCase() === sug.value.toLowerCase());
                    return (
                      <div
                        key={i}
                        onMouseDown={(e) => { e.preventDefault(); applyTypeAutofill(sug.value); setTypeOpen(false); }}
                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', borderBottom: '1px solid var(--cds-ui-03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <span>
                          {sug.source === 'history' && <i className="bi bi-clock-history" style={{ marginRight: '0.375rem', color: 'var(--cds-support-info)' }} title="Déjà commandé pour ce patient"></i>}
                          {sug.value}
                        </span>
                        {tarif && <span className="text-muted" style={{ fontSize: '0.6875rem' }}>{tarif.montant} {tarif.code}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Résultat <span className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 400 }}>(optionnel à la création)</span></label>
            <textarea className="form-input" rows={4} value={form.resultat} onChange={e => setForm({ ...form, resultat: e.target.value })} placeholder="Résultats de l'examen…" />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className="form-input" value={form.date_examen} onChange={e => setForm({ ...form, date_examen: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Montant <span className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 400 }}>(pré-rempli depuis le tarif si trouvé)</span></label>
              <input type="number" className="form-input" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} placeholder="0" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/laboratoire')}>Annuler</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : "Créer l'examen"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
