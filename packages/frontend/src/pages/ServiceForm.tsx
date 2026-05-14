import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createService, updateService, getService } from '../services/api';

export default function ServiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState({ nom: '', description: '' });
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) {
      getService(Number(id)).then(({ data }) => {
        setForm({ nom: data.nom, description: data.description || '' });
      }).catch(() => setError('Service non trouvé')).finally(() => setLoading(false));
    }
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) await updateService(Number(id), form);
      else await createService(form);
      navigate('/app/services');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/services">Services</a><span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier' : 'Nouveau service'}</span>
      </nav>
      <div className="page-header"><h1 className="page-title">{isEdit ? 'Modifier le service' : 'Nouveau service'}</h1></div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label className="form-label">Nom du service *</label><input type="text" className="form-input" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required placeholder="ex: Cardiologie, Urgences..." /></div>
          <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={4} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description du service..." /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/services')}>Annuler</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : 'Créer le service'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
