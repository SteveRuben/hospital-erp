import { useState, useCallback, useRef } from 'react';
import { searchPatientsForOrdering, advancedSearchPatients, createParcours } from '../services/api';
import { useSnackbar } from './Snackbar';

// Minimal patient shape shared by both the quick (/search/ordering) and the
// advanced (/search/advanced) endpoints — both return camelCase Prisma fields.
interface PatientHit {
  id: number;
  nom: string;
  prenom: string;
  sexe?: string | null;
  telephone?: string | null;
  ville?: string | null;
  dateNaissance?: string | null;
  referenceId?: string | null;
}

interface Props {
  // patient_ids already on the board with an active (non-'sortie') parcours —
  // re-adding them would create a duplicate card, so we block it.
  activePatientIds: Set<number>;
  onClose: () => void;
  onAdded: () => void;
}

function ageFromDob(dob?: string | null): string {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return '';
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return years >= 0 && years < 130 ? `${years} ans` : '';
}

const emptyAdv = { nom: '', prenom: '', telephone: '', ville: '', sexe: '', age_min: '', age_max: '' };

export default function AddPatientToParcoursModal({ activePatientIds, onClose, onAdded }: Props) {
  const { showSnackbar } = useSnackbar();
  const [quick, setQuick] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [adv, setAdv] = useState(emptyAdv);
  const [results, setResults] = useState<PatientHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  // Patient currently being configured for add (priorité + motif).
  const [selected, setSelected] = useState<PatientHit | null>(null);
  const [priorite, setPriorite] = useState('normal');
  const [motif, setMotif] = useState('');
  const [adding, setAdding] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runQuick = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await searchPatientsForOrdering(q.trim());
        setResults(data as PatientHit[]);
        setSearched(true);
      } catch {
        showSnackbar('Erreur de recherche', 'error');
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [showSnackbar]);

  const runAdvanced = async () => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(adv)) if (v.trim()) params[k] = v.trim();
    if (Object.keys(params).length === 0) { showSnackbar('Renseignez au moins un critère', 'info'); return; }
    setSearching(true);
    try {
      const { data } = await advancedSearchPatients({ ...params, limit: 50 });
      setResults((data.data ?? []) as PatientHit[]);
      setSearched(true);
    } catch {
      showSnackbar('Erreur de recherche', 'error');
    } finally {
      setSearching(false);
    }
  };

  const confirmAdd = async () => {
    if (!selected) return;
    setAdding(true);
    try {
      await createParcours({ patient_id: selected.id, priorite, motif: motif.trim() || undefined });
      showSnackbar(`${selected.prenom} ${selected.nom} ajouté au triage`, 'success');
      onAdded();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showSnackbar(msg || "Impossible d'ajouter au parcours", 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', width: '100%' }}>
        <div className="modal-header">
          <h3><i className="bi bi-arrow-repeat"></i> Ajouter un patient existant</h3>
          <button className="btn-icon" onClick={onClose}><i className="bi bi-x-lg"></i></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.75rem' }}>
            Pour un patient revenu à l'hôpital — recherchez-le puis ajoutez-le au triage.
          </p>

          {/* Quick search zone + multi-criteria toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <i className="bi bi-search" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}></i>
              <input
                className="form-input"
                style={{ paddingLeft: '2.25rem' }}
                placeholder="Nom, prénom, téléphone, référence…"
                value={quick}
                autoFocus
                onChange={e => { setQuick(e.target.value); setSelected(null); runQuick(e.target.value); }}
              />
            </div>
            <button
              type="button"
              className={advancedOpen ? 'btn-primary' : 'btn-secondary'}
              title="Recherche multicritère"
              onClick={() => setAdvancedOpen(o => !o)}
            >
              <i className="bi bi-sliders"></i> Multicritère
            </button>
          </div>

          {/* Advanced multi-criteria panel */}
          {advancedOpen && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--cds-field-01)', borderRadius: '4px' }}>
              <div className="grid-3" style={{ gap: '0.5rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Nom</label><input className="form-input" value={adv.nom} onChange={e => setAdv({ ...adv, nom: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Prénom</label><input className="form-input" value={adv.prenom} onChange={e => setAdv({ ...adv, prenom: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Téléphone</label><input className="form-input" value={adv.telephone} onChange={e => setAdv({ ...adv, telephone: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Ville</label><input className="form-input" value={adv.ville} onChange={e => setAdv({ ...adv, ville: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Sexe</label><select className="form-select" value={adv.sexe} onChange={e => setAdv({ ...adv, sexe: e.target.value })}><option value="">Tous</option><option value="M">Masculin</option><option value="F">Féminin</option><option value="autre">Autre</option></select></div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Âge</label>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <input className="form-input" type="number" min="0" placeholder="min" value={adv.age_min} onChange={e => setAdv({ ...adv, age_min: e.target.value })} />
                    <input className="form-input" type="number" min="0" placeholder="max" value={adv.age_max} onChange={e => setAdv({ ...adv, age_max: e.target.value })} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button type="button" className="btn-primary btn-sm" onClick={runAdvanced} disabled={searching}><i className="bi bi-search"></i> Rechercher</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => { setAdv(emptyAdv); setResults([]); setSearched(false); }}>Réinitialiser</button>
              </div>
            </div>
          )}

          {/* Results */}
          <div style={{ marginTop: '1rem', maxHeight: '40vh', overflowY: 'auto' }}>
            {searching && <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--cds-text-secondary)' }}><div className="spinner spinner-sm"></div></div>}
            {!searching && searched && results.length === 0 && (
              <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--cds-text-secondary)', fontSize: '0.8125rem' }}>Aucun patient trouvé.</div>
            )}
            {!searching && results.map(p => {
              const isActive = activePatientIds.has(p.id);
              const age = ageFromDob(p.dateNaissance);
              const isSelected = selected?.id === p.id;
              return (
                <div key={p.id} style={{ borderBottom: '1px solid var(--cds-border-subtle)', padding: '0.5rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.prenom} {p.nom}</div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>
                        {p.referenceId || `#${p.id}`}{age ? ` · ${age}` : ''}{p.telephone ? ` · ${p.telephone}` : ''}{p.ville ? ` · ${p.ville}` : ''}
                      </div>
                    </div>
                    {isActive ? (
                      <span className="tag tag-blue" style={{ fontSize: '0.625rem', whiteSpace: 'nowrap' }}>déjà en cours</span>
                    ) : (
                      <button type="button" className="btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => { setSelected(isSelected ? null : p); setPriorite('normal'); setMotif(''); }}>
                        <i className="bi bi-plus-lg"></i> {isSelected ? 'Annuler' : 'Ajouter'}
                      </button>
                    )}
                  </div>
                  {isSelected && !isActive && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Priorité</label>
                        <select className="form-select" value={priorite} onChange={e => setPriorite(e.target.value)} style={{ minWidth: '130px' }}>
                          <option value="normal">Normale</option>
                          <option value="prioritaire">Prioritaire</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '160px' }}>
                        <label className="form-label">Motif (optionnel)</label>
                        <input className="form-input" value={motif} onChange={e => setMotif(e.target.value)} placeholder="ex: contrôle, retour de plaie…" />
                      </div>
                      <button type="button" className="btn-primary btn-sm" onClick={confirmAdd} disabled={adding}>
                        <i className="bi bi-check-lg"></i> Au triage
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
