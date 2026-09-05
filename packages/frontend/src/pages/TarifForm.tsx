import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTarifs, createTarif, updateTarif } from '../services/api';
import { useSnackbar } from '../components/Snackbar';

export default function TarifForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { showSnackbar } = useSnackbar();
  const [form, setForm] = useState({ code: '', libelle: '', categorie: '', montant: '' });
  const [categories, setCategories] = useState<string[]>([]);
  const [useFreeText, setUseFreeText] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getTarifs().then(({ data }) => {
      const cats = [...new Set(data.map((t: any) => t.categorie).filter(Boolean))] as string[];
      setCategories(cats);
      if (isEdit) {
        const t = data.find((t: any) => String(t.id) === id);
        if (t) {
          setForm({
            code: t.code || '',
            libelle: t.libelle || '',
            categorie: t.categorie || '',
            montant: t.montant ? String(t.montant) : '',
          });
          if (t.categorie && !cats.includes(t.categorie)) setUseFreeText(true);
        }
      }
    }).catch(() => setError('Erreur de chargement')).finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        code: form.code,
        libelle: form.libelle,
        categorie: form.categorie,
        montant: parseFloat(form.montant),
      };
      if (isEdit) await updateTarif(Number(id), payload);
      else await createTarif(payload);
      showSnackbar(isEdit ? 'Tarif modifié' : 'Tarif créé', 'success');
      navigate('/app/facturation');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/facturation">Facturation</a><span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier le tarif' : 'Nouveau tarif'}</span>
      </nav>
      <div className="page-header"><h1 className="page-title">{isEdit ? 'Modifier le tarif' : 'Nouveau tarif'}</h1></div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Code *</label>
              <input type="text" className="form-input" value={form.code} onChange={e => setForm({...form, code: e.target.value})} required placeholder="ex: CONS-GEN" />
            </div>
            <div className="form-group">
              <label className="form-label">Montant (XOF) *</label>
              <input type="number" className="form-input" value={form.montant} onChange={e => setForm({...form, montant: e.target.value})} required min="0" step="50" placeholder="0" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Libellé *</label>
            <input type="text" className="form-input" value={form.libelle} onChange={e => setForm({...form, libelle: e.target.value})} required placeholder="ex: Consultation générale" />
          </div>

          <div className="form-group">
            <label className="form-label">Catégorie *</label>
            {categories.length > 0 && !useFreeText ? (
              <div className="d-flex gap-1 align-center">
                <select className="form-select" style={{ flex: 1 }} value={form.categorie} onChange={e => {
                  if (e.target.value === '__free__') { setUseFreeText(true); setForm({...form, categorie: ''}); }
                  else setForm({...form, categorie: e.target.value});
                }} required>
                  <option value="">— Sélectionner —</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__free__">Autre (saisie libre)...</option>
                </select>
              </div>
            ) : (
              <div className="d-flex gap-1 align-center">
                <input type="text" className="form-input" style={{ flex: 1 }} value={form.categorie} onChange={e => setForm({...form, categorie: e.target.value})} required placeholder="ex: Consultation, Laboratoire, Imagerie" autoFocus />
                {categories.length > 0 && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => { setUseFreeText(false); setForm({...form, categorie: ''}); }}>
                    <i className="bi bi-arrow-left"></i> Liste
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/facturation')}>Annuler</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : 'Créer le tarif'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
