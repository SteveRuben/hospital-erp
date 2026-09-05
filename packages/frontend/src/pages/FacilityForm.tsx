import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getFacilities, getFacility, createFacility, updateFacility } from '../services/api';
import { useSnackbar } from '../components/Snackbar';

const typeOptions = [
  { value: 'hopital', label: 'Hôpital' },
  { value: 'clinique', label: 'Clinique' },
  { value: 'centre_sante', label: 'Centre de santé' },
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'branche', label: 'Branche / Antenne' },
  { value: 'autre', label: 'Autre' },
];

export default function FacilityForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { showSnackbar } = useSnackbar();
  const [form, setForm] = useState({ nom: '', code: '', type_facility: 'hopital', parent_id: '', adresse: '', ville: '', telephone: '', email: '' });
  const [facilities, setFacilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getFacilities(),
      isEdit ? getFacility(Number(id)) : Promise.resolve(null),
    ]).then(([f, fac]) => {
      setFacilities(f.data);
      if (fac?.data) {
        const d = fac.data as any;
        setForm({
          nom: d.nom || '',
          code: d.code || '',
          type_facility: d.typeFacility || 'hopital',
          parent_id: d.parentId ? String(d.parentId) : '',
          adresse: d.adresse || '',
          ville: d.ville || '',
          telephone: d.telephone || '',
          email: d.email || '',
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
        code: form.code || null,
        type_facility: form.type_facility,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        adresse: form.adresse || null,
        ville: form.ville || null,
        telephone: form.telephone || null,
        email: form.email || null,
      };
      if (isEdit) await updateFacility(Number(id), payload);
      else await createFacility(payload);
      showSnackbar(isEdit ? 'Établissement modifié' : 'Établissement créé', 'success');
      navigate('/app/etablissements');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const topLevel = facilities.filter(f => !f.parentId && (!isEdit || f.id !== Number(id)));

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/etablissements">Établissements</a><span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier' : 'Nouveau'}</span>
      </nav>
      <div className="page-header"><h1 className="page-title">{isEdit ? 'Modifier l\'établissement' : 'Nouvel établissement'}</h1></div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Nom *</label><input type="text" className="form-input" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required placeholder="ex: Hôpital Général" /></div>
            <div className="form-group"><label className="form-label">Code</label><input type="text" className="form-input" value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="Code unique" /></div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Type d'établissement</label>
              <select className="form-select" value={form.type_facility} onChange={e => setForm({...form, type_facility: e.target.value})}>
                {typeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Parent (branche de)</label>
              <select className="form-select" value={form.parent_id} onChange={e => setForm({...form, parent_id: e.target.value})}>
                <option value="">— Aucun (établissement principal) —</option>
                {topLevel.map(f => (
                  <option key={f.id} value={f.id}>{f.nom}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group"><label className="form-label">Adresse</label><input type="text" className="form-input" value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})} placeholder="Adresse complète" /></div>

          <div className="grid-3">
            <div className="form-group"><label className="form-label">Ville</label><input type="text" className="form-input" value={form.ville} onChange={e => setForm({...form, ville: e.target.value})} placeholder="ex: Douala" /></div>
            <div className="form-group"><label className="form-label">Téléphone</label><input type="text" className="form-input" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} placeholder="ex: +237 XXX XXX XXX" /></div>
            <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="contact@..." /></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/etablissements')}>Annuler</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : 'Créer l\'établissement'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
