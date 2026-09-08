import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPatient, updatePatient, getPatient } from '../services/api';
import api from '../services/api';
import { useFormPersist } from '../hooks/useFormPersist';
import { patientServerToForm } from '../lib/formCoerce';

const emptyForm = {
  nom: '', prenom: '', deuxieme_prenom: '', sexe: '', date_naissance: '', age_estime: '',
  lieu_naissance: '', nationalite: '', numero_identite: '', statut_matrimonial: '', groupe_sanguin: '',
  pays: '', province: '', ville: '', commune: '', quartier: '', adresse: '',
  profession: '', telephone: '', email: '',
  contact_urgence_nom: '', contact_urgence_relation: '', contact_urgence_telephone: '',
};

type PatientFormShape = typeof emptyForm;

// Light input mask for phone fields: keeps digits and a leading +, caps the
// length, but does NOT invent a country code or re-group digits — the old
// version turned "690320123" into "+690 320 12" (Tokelau!) by assuming the
// first 3 digits were a country prefix and silently dropped digit 13+.
const formatPhone = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/\D/g, '').slice(0, 15)}`;
  return trimmed.replace(/\D/g, '').slice(0, 15);
};

// patientServerToForm lives in src/lib/formCoerce so it can be unit-tested
// without rendering this page. See lib/formCoerce.test.ts for the cases
// — every null / camelCase / groupe_sanguin enum bug is pinned there.

// Field wrapper: label + control, compact like the rest of the app.
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{required && ' *'}</label>
      {children}
    </div>
  );
}

const RELATION_OPTIONS = [
  { value: 'conjoint', label: 'Conjoint(e)' },
  { value: 'parent', label: 'Parent' },
  { value: 'enfant', label: 'Enfant' },
  { value: 'frere_soeur', label: 'Frère/Sœur' },
  { value: 'ami', label: 'Ami(e)' },
  { value: 'autre', label: 'Autre' },
];

export default function PatientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState<PatientFormShape>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [paysList, setPaysList] = useState<Array<{ code: string; libelle: string }>>([]);
  const [villesList, setVillesList] = useState<Array<{ code: string; libelle: string; parent_code: string | null }>>([]);

  // Single source of truth for keystroke-level autosave. Disabled while the
  // initial load runs: in edit mode the restored draft and the server fetch
  // race and the last writer silently wins (the fetch overwrote the draft —
  // or worse, a stale draft became the edit state when the fetch failed).
  const { clearSaved, hasSaved } = useFormPersist(isEdit ? `patient_edit_${id}` : 'patient_new', form, setForm, !loading);

  useEffect(() => {
    Promise.all([
      api.get('/reference-lists/pays'),
      api.get('/reference-lists/ville'),
      isEdit ? getPatient(Number(id)) : Promise.resolve(null),
    ]).then(([paysRes, villesRes, patientRes]) => {
      setPaysList(paysRes.data);
      setVillesList(villesRes.data);
      if (patientRes?.data) setForm(patientServerToForm(patientRes.data));
    }).catch(() => setError('Erreur de chargement')).finally(() => setLoading(false));
  }, [id]);

  // In create mode, an abandoned draft in sessionStorage is restored by the
  // hook. Surface it so the user knows (and can discard) instead of silently
  // editing a stale draft from a previous session.
  useEffect(() => {
    if (!loading && !isEdit && hasSaved) setDraftRestored(true);
  }, [loading, isEdit, hasSaved]);

  const set = (patch: Partial<PatientFormShape>) => setForm(f => ({ ...f, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = { ...form, age_estime: form.age_estime ? Number(form.age_estime) : null };
      if (isEdit) await updatePatient(Number(id), payload);
      else await createPatient(payload);
      clearSaved(); // Clear persisted form data on success
      navigate('/app/patients');
    } catch (err: any) {
      // Offline mutations are queued for replay, not lost — tell the user
      // the truth instead of "Erreur lors de l'enregistrement".
      if (err?.isOfflineQueued) {
        clearSaved();
        navigate('/app/patients');
        return;
      }
      const details = err.response?.data?.details;
      const detail = Array.isArray(details) && details.length ? ` (${details.join(', ')})` : '';
      setError((err.response?.data?.error || 'Erreur lors de l\'enregistrement') + detail);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const discardDraft = () => {
    clearSaved();
    setForm(emptyForm);
    setDraftRestored(false);
  };

  const jumpTo = (anchor: string) => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/patients">Patients</a><span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier' : 'Nouveau patient'}</span>
      </nav>
      <div className="page-header">
        <h1 className="page-title">{isEdit ? 'Modifier le patient' : 'Nouveau patient'}</h1>
      </div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      {draftRestored && (
        <div className="notification notification-warning mb-2" style={{ alignItems: 'center' }}>
          <i className="bi bi-clock-history"></i>
          <span>Brouillon restauré automatiquement (session précédente).</span>
          <button type="button" className="btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={discardDraft}>Repartir de zéro</button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Section nav — replaces the old 4-step wizard. One page, everything
            visible (the contact d'urgence was buried in step 4 of 4), quick
            jump links + live completion cue. */}
        <div className="form-section-nav mb-2">
          <button type="button" onClick={() => jumpTo('section-identite')}><i className="bi bi-person-vcard"></i> Identité</button>
          <button type="button" onClick={() => jumpTo('section-contact')}><i className="bi bi-telephone"></i> Contact</button>
          <button type="button" onClick={() => jumpTo('section-adresse')}><i className="bi bi-geo-alt"></i> Adresse</button>
          <button type="button" onClick={() => jumpTo('section-demographie')}><i className="bi bi-people"></i> Démographie</button>
        </div>

        {/* ===== Contact FIRST — the reported pain was entering contacts on
             creation: they were the last step of the wizard. ===== */}
        <fieldset id="section-contact" className="tile form-section">
          <legend><i className="bi bi-telephone"></i> Contact</legend>
          <div className="grid-2">
            <Field label="Téléphone">
              <input type="tel" className="form-input" value={form.telephone} onChange={e => set({ telephone: formatPhone(e.target.value) })} placeholder="+237 6XX XXX XXX" />
            </Field>
            <Field label="Email">
              <input type="email" className="form-input" value={form.email} onChange={e => set({ email: e.target.value })} placeholder="nom@exemple.cm" />
            </Field>
          </div>
          <div className="subsection-label mt-2"><i className="bi bi-person-raised-hand"></i> Contact d'urgence</div>
          <div className="grid-3">
            <Field label="Nom complet">
              <input type="text" className="form-input" value={form.contact_urgence_nom} onChange={e => set({ contact_urgence_nom: e.target.value })} placeholder="Ex: Marie Ndongo" />
            </Field>
            <Field label="Relation">
              <select className="form-select" value={form.contact_urgence_relation} onChange={e => set({ contact_urgence_relation: e.target.value })}>
                <option value="">Sélectionner...</option>
                {RELATION_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Téléphone">
              <input type="tel" className="form-input" value={form.contact_urgence_telephone} onChange={e => set({ contact_urgence_telephone: formatPhone(e.target.value) })} placeholder="+237 6XX XXX XXX" />
            </Field>
          </div>
        </fieldset>

        {/* ===== Identité ===== */}
        <fieldset id="section-identite" className="tile form-section">
          <legend><i className="bi bi-person-vcard"></i> Identité</legend>
          <div className="grid-3">
            <Field label="Nom" required>
              <input type="text" className="form-input" value={form.nom} onChange={e => set({ nom: e.target.value })} required />
            </Field>
            <Field label="Prénom" required>
              <input type="text" className="form-input" value={form.prenom} onChange={e => set({ prenom: e.target.value })} required />
            </Field>
            <Field label="Deuxième prénom">
              <input type="text" className="form-input" value={form.deuxieme_prenom} onChange={e => set({ deuxieme_prenom: e.target.value })} />
            </Field>
          </div>
          <div className="grid-3">
            <Field label="Sexe" required>
              <select className="form-select" value={form.sexe} onChange={e => set({ sexe: e.target.value })} required>
                <option value="">Sélectionner...</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
                <option value="autre">Autre</option>
              </select>
            </Field>
            <Field label="Date de naissance">
              <input type="date" className="form-input" value={form.date_naissance} onChange={e => set({ date_naissance: e.target.value })} />
            </Field>
            <Field label="Âge estimé">
              <input type="number" className="form-input" value={form.age_estime} onChange={e => set({ age_estime: e.target.value })} placeholder="ex: 35 — si la date est inconnue" />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="N° identité nationale">
              <input type="text" className="form-input" value={form.numero_identite} onChange={e => set({ numero_identite: e.target.value })} />
            </Field>
            <Field label="Groupe sanguin">
              <select className="form-select" value={form.groupe_sanguin} onChange={e => set({ groupe_sanguin: e.target.value })}>
                <option value="">Inconnu</option>
                <option value="A+">A+</option><option value="A-">A-</option>
                <option value="B+">B+</option><option value="B-">B-</option>
                <option value="AB+">AB+</option><option value="AB-">AB-</option>
                <option value="O+">O+</option><option value="O-">O-</option>
              </select>
            </Field>
          </div>
        </fieldset>

        {/* ===== Adresse ===== */}
        <fieldset id="section-adresse" className="tile form-section">
          <legend><i className="bi bi-geo-alt"></i> Adresse</legend>
          <div className="grid-2">
            <Field label="Pays">
              <select className="form-select" value={form.pays} onChange={e => set({ pays: e.target.value, ville: '' })}>
                <option value="">Sélectionner un pays...</option>
                {paysList.map(p => <option key={p.code} value={p.libelle}>{p.libelle}</option>)}
              </select>
            </Field>
            <Field label="Province / Région">
              <input type="text" className="form-input" value={form.province} onChange={e => set({ province: e.target.value })} />
            </Field>
          </div>
          <div className="grid-3">
            <Field label="Ville">
              <select className="form-select" value={form.ville} onChange={e => set({ ville: e.target.value })}>
                <option value="">Sélectionner une ville...</option>
                {villesList
                  .filter(v => !form.pays || !v.parent_code || paysList.find(p => p.libelle === form.pays)?.code === v.parent_code)
                  .map(v => <option key={v.code} value={v.libelle}>{v.libelle}</option>)}
              </select>
            </Field>
            <Field label="Commune">
              <input type="text" className="form-input" value={form.commune} onChange={e => set({ commune: e.target.value })} />
            </Field>
            <Field label="Quartier">
              <input type="text" className="form-input" value={form.quartier} onChange={e => set({ quartier: e.target.value })} />
            </Field>
          </div>
          <Field label="Adresse complète">
            <input type="text" className="form-input" value={form.adresse} onChange={e => set({ adresse: e.target.value })} placeholder="Rue, porte, repère…" />
          </Field>
        </fieldset>

        {/* ===== Démographie ===== */}
        <fieldset id="section-demographie" className="tile form-section">
          <legend><i className="bi bi-people"></i> Démographie</legend>
          <div className="grid-3">
            <Field label="Lieu de naissance">
              <input type="text" className="form-input" value={form.lieu_naissance} onChange={e => set({ lieu_naissance: e.target.value })} />
            </Field>
            <Field label="Nationalité">
              <input type="text" className="form-input" value={form.nationalite} onChange={e => set({ nationalite: e.target.value })} />
            </Field>
            <Field label="Profession">
              <input type="text" className="form-input" value={form.profession} onChange={e => set({ profession: e.target.value })} />
            </Field>
          </div>
          <Field label="Statut matrimonial">
            <select className="form-select" value={form.statut_matrimonial} onChange={e => set({ statut_matrimonial: e.target.value })}>
              <option value="">Non renseigné</option>
              <option value="celibataire">Célibataire</option>
              <option value="marie">Marié(e)</option>
              <option value="divorce">Divorcé(e)</option>
              <option value="veuf">Veuf/Veuve</option>
            </select>
          </Field>
        </fieldset>

        {/* Sticky submit bar: the autosave cue ("Brouillon enregistré") tells
            the user their keystrokes survive a session timeout — the old form
            never showed this, which is why drafts "were lost". */}
        <div className="form-action-bar">
          <span className="autosave-cue"><i className="bi bi-cloud-check"></i> Brouillon enregistré automatiquement</span>
          <div className="d-flex gap-1">
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/patients')}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <><i className="bi bi-arrow-repeat spin"></i> Enregistrement…</> : <><i className="bi bi-check-lg"></i> {isEdit ? 'Enregistrer' : 'Créer le patient'}</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
