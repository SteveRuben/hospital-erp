import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createMedecin, updateMedecin, getMedecin } from '../services/api';

export default function MedecinForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState({ nom: '', prenom: '', specialite: '', telephone: '' });
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) {
      getMedecin(Number(id)).then(({ data }) => {
        setForm({ nom: data.nom, prenom: data.prenom, specialite: data.specialite || '', telephone: data.telephone || '' });
      }).catch(() => setError('Médecin non trouvé')).finally(() => setLoading(false));
    }
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) await updateMedecin(Number(id), form);
      else await createMedecin(form);
      navigate('/app/medecins');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/medecins">Médecins</a><span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier' : 'Nouveau médecin'}</span>
      </nav>
      <div className="page-header"><h1 className="page-title">{isEdit ? 'Modifier le médecin' : 'Nouveau médecin'}</h1></div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Nom *</label><input type="text" className="form-input" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required /></div>
            <div className="form-group"><label className="form-label">Prénom *</label><input type="text" className="form-input" value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} required /></div>
          </div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Spécialité</label><input type="text" className="form-input" value={form.specialite} onChange={e => setForm({...form, specialite: e.target.value})} placeholder="ex: Cardiologie, Pédiatrie..." /></div>
            <div className="form-group"><label className="form-label">Téléphone</label><input type="tel" className="form-input" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} placeholder="+237 6XX XXX XXX" /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/medecins')}>Annuler</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : 'Créer le médecin'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
