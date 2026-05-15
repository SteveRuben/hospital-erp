import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPatient, updatePatient, getPatient } from '../services/api';
import api from '../services/api';
import { useFormPersist } from '../hooks/useFormPersist';

const emptyForm = {
  nom: '', prenom: '', deuxieme_prenom: '', sexe: '', date_naissance: '', age_estime: '',
  lieu_naissance: '', nationalite: '', numero_identite: '', statut_matrimonial: '', groupe_sanguin: '',
  pays: '', province: '', ville: '', commune: '', quartier: '', adresse: '',
  profession: '', telephone: '', email: '',
  contact_urgence_nom: '', contact_urgence_relation: '', contact_urgence_telephone: '',
};

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `+${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 9) return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9, 12)}`;
};

export default function PatientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paysList, setPaysList] = useState<Array<{ code: string; libelle: string }>>([]);
  const [villesList, setVillesList] = useState<Array<{ code: string; libelle: string; parent_code: string | null }>>([]);

  // Persist form data across session timeouts
  const { clearSaved } = useFormPersist(isEdit ? `patient_edit_${id}` : 'patient_new', form, setForm);

  useEffect(() => {
    // Load reference lists + patient data
    Promise.all([
      api.get('/reference-lists/pays'),
      api.get('/reference-lists/ville'),
      isEdit ? getPatient(Number(id)) : Promise.resolve(null),
    ]).then(([paysRes, villesRes, patientRes]) => {
      setPaysList(paysRes.data);
      setVillesList(villesRes.data);
      if (patientRes?.data) {
        setForm({ ...emptyForm, ...patientRes.data, age_estime: patientRes.data.age_estime ? String(patientRes.data.age_estime) : '' });
      }
    }).catch(() => setError('Erreur de chargement')).finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form, age_estime: form.age_estime ? Number(form.age_estime) : null };
      if (isEdit) await updatePatient(Number(id), payload);
      else await createPatient(payload);
      clearSaved(); // Clear persisted form data on success
      navigate('/app/patients');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de l\'enregistrement');
    }
  };

  const steps = ['Identité', 'Démographie', 'Adresse', 'Contact'];

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

      {/* Wizard steps */}
      <div className="wizard-steps mb-2">
        {steps.map((s, i) => (
          <div key={i} className={`wizard-step ${step === i ? 'active' : ''} ${step > i ? 'completed' : ''}`} onClick={() => setStep(i)}>
            <div className="step-number">{step > i ? '✓' : i + 1}</div>
            <div>{s}</div>
          </div>
        ))}
      </div>

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          {/* Step 0: Identité */}
          {step === 0 && (
            <div>
              <div className="grid-3">
                <div className="form-group"><label className="form-label">Nom *</label><input type="text" className="form-input" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required /></div>
                <div className="form-group"><label className="form-label">Prénom *</label><input type="text" className="form-input" value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} required /></div>
                <div className="form-group"><label className="form-label">Deuxième prénom</label><input type="text" className="form-input" value={form.deuxieme_prenom} onChange={e => setForm({...form, deuxieme_prenom: e.target.value})} /></div>
              </div>
              <div className="grid-3">
                <div className="form-group"><label className="form-label">Sexe *</label><select className="form-select" value={form.sexe} onChange={e => setForm({...form, sexe: e.target.value})} required><option value="">Sélectionner...</option><option value="M">Masculin</option><option value="F">Féminin</option><option value="autre">Autre</option></select></div>
                <div className="form-group"><label className="form-label">Date de naissance</label><input type="date" className="form-input" value={form.date_naissance} onChange={e => setForm({...form, date_naissance: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Âge estimé</label><input type="number" className="form-input" value={form.age_estime} onChange={e => setForm({...form, age_estime: e.target.value})} placeholder="ex: 35" /></div>
              </div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">N° identité nationale</label><input type="text" className="form-input" value={form.numero_identite} onChange={e => setForm({...form, numero_identite: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Groupe sanguin</label><select className="form-select" value={form.groupe_sanguin} onChange={e => setForm({...form, groupe_sanguin: e.target.value})}><option value="">Inconnu</option><option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option><option value="AB+">AB+</option><option value="AB-">AB-</option><option value="O+">O+</option><option value="O-">O-</option></select></div>
              </div>
            </div>
          )}

          {/* Step 1: Démographie */}
          {step === 1 && (
            <div>
              <div className="grid-3">
                <div className="form-group"><label className="form-label">Lieu de naissance</label><input type="text" className="form-input" value={form.lieu_naissance} onChange={e => setForm({...form, lieu_naissance: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Nationalité</label><input type="text" className="form-input" value={form.nationalite} onChange={e => setForm({...form, nationalite: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Profession</label><input type="text" className="form-input" value={form.profession} onChange={e => setForm({...form, profession: e.target.value})} /></div>
              </div>
              <div className="form-group"><label className="form-label">Statut matrimonial</label><select className="form-select" value={form.statut_matrimonial} onChange={e => setForm({...form, statut_matrimonial: e.target.value})}><option value="">Non renseigné</option><option value="celibataire">Célibataire</option><option value="marie">Marié(e)</option><option value="divorce">Divorcé(e)</option><option value="veuf">Veuf/Veuve</option></select></div>
            </div>
          )}

          {/* Step 2: Adresse */}
          {step === 2 && (
            <div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Pays</label>
                  <select className="form-select" value={form.pays} onChange={e => setForm({...form, pays: e.target.value, ville: ''})}>
                    <option value="">Sélectionner un pays...</option>
                    {paysList.map(p => <option key={p.code} value={p.libelle}>{p.libelle}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Province / Région</label><input type="text" className="form-input" value={form.province} onChange={e => setForm({...form, province: e.target.value})} /></div>
              </div>
              <div className="grid-3">
                <div className="form-group"><label className="form-label">Ville</label>
                  <select className="form-select" value={form.ville} onChange={e => setForm({...form, ville: e.target.value})}>
                    <option value="">Sélectionner une ville...</option>
                    {villesList
                      .filter(v => !form.pays || !v.parent_code || paysList.find(p => p.libelle === form.pays)?.code === v.parent_code)
                      .map(v => <option key={v.code} value={v.libelle}>{v.libelle}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Commune</label><input type="text" className="form-input" value={form.commune} onChange={e => setForm({...form, commune: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Quartier</label><input type="text" className="form-input" value={form.quartier} onChange={e => setForm({...form, quartier: e.target.value})} /></div>
              </div>
              <div className="form-group"><label className="form-label">Adresse complète</label><input type="text" className="form-input" value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})} /></div>
            </div>
          )}

          {/* Step 3: Contact */}
          {step === 3 && (
            <div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Téléphone</label><input type="tel" className="form-input" value={form.telephone} onChange={e => setForm({...form, telephone: formatPhone(e.target.value)})} placeholder="+237 6XX XXX XXX" /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              </div>
              <h4 style={{fontSize:'0.875rem',fontWeight:600,margin:'1.5rem 0 1rem',borderBottom:'1px solid var(--cds-ui-03)',paddingBottom:'0.5rem'}}>Contact d'urgence</h4>
              <div className="grid-3">
                <div className="form-group"><label className="form-label">Nom complet</label><input type="text" className="form-input" value={form.contact_urgence_nom} onChange={e => setForm({...form, contact_urgence_nom: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Relation</label><select className="form-select" value={form.contact_urgence_relation} onChange={e => setForm({...form, contact_urgence_relation: e.target.value})}><option value="">Sélectionner...</option><option value="conjoint">Conjoint(e)</option><option value="parent">Parent</option><option value="enfant">Enfant</option><option value="frere_soeur">Frère/Sœur</option><option value="ami">Ami(e)</option><option value="autre">Autre</option></select></div>
                <div className="form-group"><label className="form-label">Téléphone</label><input type="tel" className="form-input" value={form.contact_urgence_telephone} onChange={e => setForm({...form, contact_urgence_telephone: formatPhone(e.target.value)})} placeholder="+237 6XX XXX XXX" /></div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <div>
              {step > 0 && <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>← Précédent</button>}
            </div>
            <div className="d-flex gap-1">
              <button type="button" className="btn-secondary" onClick={() => navigate('/app/patients')}>Annuler</button>
              {step < steps.length - 1 ? (
                <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>Suivant →</button>
              ) : (
                <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : 'Créer le patient'}</button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
