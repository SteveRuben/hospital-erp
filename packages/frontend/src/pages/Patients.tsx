import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPatients, createPatient, updatePatient, deletePatient } from '../services/api';
import type { Patient } from '../types';

const emptyForm = {
  nom: '', prenom: '', deuxieme_prenom: '', sexe: '', date_naissance: '', age_estime: '',
  lieu_naissance: '', nationalite: '', numero_identite: '', statut_matrimonial: '', groupe_sanguin: '',
  pays: '', province: '', ville: '', commune: '', quartier: '', adresse: '',
  profession: '', telephone: '', email: '',
  contact_urgence_nom: '', contact_urgence_relation: '', contact_urgence_telephone: '',
};

// Format phone: +243 XXX XXX XXX
const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `+${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 9) return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9, 12)}`;
};

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => { loadPatients(); }, [search]);

  const loadPatients = async () => {
    try { const { data } = await getPatients({ search }); setPatients(data.data || data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form, age_estime: form.age_estime ? Number(form.age_estime) : null };
      if (editing) await updatePatient(editing.id, payload);
      else await createPatient(payload);
      setShowModal(false); setEditing(null); setForm(emptyForm); setStep(0);
      loadPatients();
    } catch { alert('Erreur'); }
  };

  const handleEdit = (p: Patient) => { setEditing(p); setForm(p as unknown as typeof emptyForm); setShowModal(true); setStep(0); };
  const handleDelete = async (id: number) => { if (confirm('Archiver ce patient ?')) { await deletePatient(id); loadPatients(); }};

  const steps = ['Identité', 'Démographie', 'Adresse', 'Contact'];

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Patients</span></nav>
      <div className="page-header">
        <h1 className="page-title">Patients</h1>
        <button className="btn-primary" onClick={() => { setEditing(null); setForm(emptyForm); setStep(0); setShowModal(true); }}><i className="bi bi-plus"></i> Nouveau patient</button>
      </div>

      <div className="table-toolbar">
        <div className="search-input"><i className="bi bi-search"></i><input type="text" placeholder="Rechercher par nom, téléphone, ID..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>

      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        <table className="data-table">
          <thead><tr><th>ID</th><th>Nom</th><th>Prénom</th><th>Sexe</th><th>Téléphone</th><th>Ville</th><th>Actions</th></tr></thead>
          <tbody>
            {patients.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/patients/${p.id}`)}>
                <td>#{p.id}</td>
                <td>{p.nom}</td>
                <td>{p.prenom}</td>
                <td>{(p as any).sexe === 'M' ? <span className="tag tag-blue">M</span> : (p as any).sexe === 'F' ? <span className="tag tag-purple">F</span> : '-'}</td>
                <td>{p.telephone || '-'}</td>
                <td>{(p as any).ville || '-'}</td>
                <td onClick={e => e.stopPropagation()}>
                  <button className="btn-icon" onClick={() => handleEdit(p)}><i className="bi bi-pencil"></i></button>
                  <button className="btn-icon" onClick={() => handleDelete(p.id)}><i className="bi bi-archive"></i></button>
                </td>
              </tr>
            ))}
            {patients.length === 0 && <tr><td colSpan={7} className="table-empty"><i className="bi bi-people" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Aucun patient</td></tr>}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-container modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{editing ? 'Modifier' : 'Nouveau'} patient</h3><button className="btn-icon" onClick={() => setShowModal(false)}><i className="bi bi-x-lg"></i></button></div>

            {/* Wizard steps */}
            <div className="wizard-steps">
              {steps.map((s, i) => (
                <div key={i} className={`wizard-step ${step === i ? 'active' : ''} ${step > i ? 'completed' : ''}`} onClick={() => setStep(i)}>
                  <div className="step-number">{step > i ? '✓' : i + 1}</div>
                  <div>{s}</div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
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
                      <div className="form-group"><label className="form-label">Âge estimé (si date inconnue)</label><input type="number" className="form-input" value={form.age_estime} onChange={e => setForm({...form, age_estime: e.target.value})} placeholder="ex: 35" /></div>
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
                      <div className="form-group"><label className="form-label">Pays</label><input type="text" className="form-input" value={form.pays} onChange={e => setForm({...form, pays: e.target.value})} /></div>
                      <div className="form-group"><label className="form-label">Province / Région</label><input type="text" className="form-input" value={form.province} onChange={e => setForm({...form, province: e.target.value})} /></div>
                    </div>
                    <div className="grid-3">
                      <div className="form-group"><label className="form-label">Ville</label><input type="text" className="form-input" value={form.ville} onChange={e => setForm({...form, ville: e.target.value})} /></div>
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
                      <div className="form-group"><label className="form-label">Téléphone</label><input type="tel" className="form-input" value={form.telephone} onChange={e => setForm({...form, telephone: formatPhone(e.target.value)})} placeholder="+243 XXX XXX XXX" /></div>
                      <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
                    </div>
                    <h4 style={{fontSize:'0.875rem',fontWeight:600,margin:'1.5rem 0 1rem',borderBottom:'1px solid var(--cds-ui-03)',paddingBottom:'0.5rem'}}>Contact d'urgence</h4>
                    <div className="grid-3">
                      <div className="form-group"><label className="form-label">Nom complet</label><input type="text" className="form-input" value={form.contact_urgence_nom} onChange={e => setForm({...form, contact_urgence_nom: e.target.value})} /></div>
                      <div className="form-group"><label className="form-label">Relation</label><select className="form-select" value={form.contact_urgence_relation} onChange={e => setForm({...form, contact_urgence_relation: e.target.value})}><option value="">Sélectionner...</option><option value="conjoint">Conjoint(e)</option><option value="parent">Parent</option><option value="enfant">Enfant</option><option value="frere_soeur">Frère/Sœur</option><option value="ami">Ami(e)</option><option value="autre">Autre</option></select></div>
                      <div className="form-group"><label className="form-label">Téléphone</label><input type="tel" className="form-input" value={form.contact_urgence_telephone} onChange={e => setForm({...form, contact_urgence_telephone: formatPhone(e.target.value)})} placeholder="+243 XXX XXX XXX" /></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                <div>
                  {step > 0 && <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>← Précédent</button>}
                </div>
                <div style={{ display: 'flex' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                  {step < steps.length - 1 ? (
                    <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>Suivant →</button>
                  ) : (
                    <button type="submit" className="btn-primary">Enregistrer</button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}