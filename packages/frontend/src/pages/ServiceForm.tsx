import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createService, updateService, getService, getServices } from '../services/api';
import { useSnackbar } from '../components/Snackbar';

export default function ServiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { showSnackbar } = useSnackbar();
  const [form, setForm] = useState({ nom: '', description: '', parent_id: '', prix: '', poids: '', code: '', actif: true });
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getServices(),
      isEdit ? getService(Number(id)) : Promise.resolve(null),
    ]).then(([s, svc]) => {
      setServices(s.data);
      if (svc?.data) {
        const d = svc.data as any;
        setForm({
          nom: d.nom || '',
          description: d.description || '',
          parent_id: d.parent_id ? String(d.parent_id) : '',
          prix: d.prix ? String(d.prix) : '',
          poids: d.poids ? String(d.poids) : '',
          code: d.code || '',
          actif: d.actif !== false,
        });
      }
    }).catch(() => setError('Erreur de chargement')).finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        nom: form.nom,
        description: form.description || null,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        prix: form.prix ? parseFloat(form.prix) : 0,
        poids: form.poids ? parseInt(form.poids) : 0,
        code: form.code || null,
        actif: form.actif,
      };
      if (isEdit) await updateService(Number(id), payload);
      else await createService(payload);
      showSnackbar(isEdit ? 'Service modifié' : 'Service créé', 'success');
      navigate('/app/services');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  // Filter out current service from parent list (can't be its own parent)
  const parentOptions = services.filter(s => !isEdit || s.id !== Number(id));

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
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Nom du service *</label><input type="text" className="form-input" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required placeholder="ex: Consultation générale" /></div>
            <div className="form-group"><label className="form-label">Code (optionnel)</label><input type="text" className="form-input" value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})} placeholder="ex: CONS_GEN" /></div>
          </div>

          <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description du service..." /></div>

          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Service parent (pour sous-service)</label>
              <select className="form-select" value={form.parent_id} onChange={e => setForm({...form, parent_id: e.target.value})}>
                <option value="">— Aucun (service principal) —</option>
                {parentOptions.filter(s => !s.parent_id).map(s => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Prix (XAF)</label><input type="number" className="form-input" value={form.prix} onChange={e => setForm({...form, prix: e.target.value})} placeholder="0" min="0" step="100" /></div>
            <div className="form-group"><label className="form-label">Poids (priorité d'affichage)</label><input type="number" className="form-input" value={form.poids} onChange={e => setForm({...form, poids: e.target.value})} placeholder="0" min="0" /></div>
          </div>

          {isEdit && (
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={form.actif} onChange={e => setForm({...form, actif: e.target.checked})} />
                Service actif
              </label>
              <p className="text-muted" style={{ fontSize: '0.75rem' }}>Un service inactif n'apparaît plus dans les listes déroulantes</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/services')}>Annuler</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : 'Créer le service'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
