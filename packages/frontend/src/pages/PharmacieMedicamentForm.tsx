import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { createMedicament, updateMedicament } from '../services/api';
import { useSnackbar } from '../components/Snackbar';

interface RefItem { code: string; libelle: string }

const FORME_OPTIONS = ['Comprimé', 'Capsule', 'Sirop', 'Injection', 'Pommade', 'Autre'];

export default function PharmacieMedicamentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { showSnackbar } = useSnackbar();
  const [form, setForm] = useState({
    nom: '', dci: '', forme: '', dosage_standard: '', code_barre: '', categorie: '', prix_unitaire: '',
  });
  const [formes, setFormes] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/reference-lists/forme_pharmaceutique').catch(() => ({ data: [] as RefItem[] })),
      isEdit ? api.get(`/pharmacie/medicaments/${id}`) : Promise.resolve(null),
    ]).then(([refRes, medRes]) => {
      setFormes(refRes.data);
      if (medRes?.data) {
        const d = medRes.data as any;
        setForm({
          nom: d.nom || '',
          dci: d.dci || '',
          forme: d.forme || '',
          dosage_standard: d.dosage_standard || '',
          code_barre: d.code_barre || '',
          categorie: d.categorie || '',
          prix_unitaire: d.prix_unitaire != null ? String(d.prix_unitaire) : '',
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
        dci: form.dci || null,
        forme: form.forme || null,
        dosage_standard: form.dosage_standard || null,
        code_barre: form.code_barre || null,
        categorie: form.categorie || null,
        prix_unitaire: form.prix_unitaire ? parseFloat(form.prix_unitaire) : null,
      };
      if (isEdit) await updateMedicament(Number(id), payload);
      else await createMedicament(payload);
      showSnackbar(isEdit ? 'Médicament modifié' : 'Médicament créé', 'success');
      navigate('/app/pharmacie');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/pharmacie">Pharmacie</a><span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier' : 'Nouveau médicament'}</span>
      </nav>
      <div className="page-header"><h1 className="page-title">{isEdit ? 'Modifier le médicament' : 'Nouveau médicament'}</h1></div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Nom *</label><input type="text" className="form-input" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required placeholder="ex: Paracétamol" /></div>
            <div className="form-group"><label className="form-label">DCI (principe actif)</label><input type="text" className="form-input" value={form.dci} onChange={e => setForm({...form, dci: e.target.value})} placeholder="ex: Paracétamol" /></div>
          </div>

          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Forme</label>
              <select className="form-select" value={form.forme} onChange={e => setForm({...form, forme: e.target.value})}>
                <option value="">— Sélectionner —</option>
                {formes.length > 0
                  ? formes.map(f => <option key={f.code} value={f.libelle}>{f.libelle}</option>)
                  : FORME_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)
                }
              </select>
            </div>
            <div className="form-group"><label className="form-label">Dosage standard</label><input type="text" className="form-input" value={form.dosage_standard} onChange={e => setForm({...form, dosage_standard: e.target.value})} placeholder="ex: 500mg" /></div>
            <div className="form-group"><label className="form-label">Prix unitaire</label><input type="number" className="form-input" value={form.prix_unitaire} onChange={e => setForm({...form, prix_unitaire: e.target.value})} placeholder="0" min="0" step="1" /></div>
          </div>

          <div className="grid-2">
            <div className="form-group"><label className="form-label">Catégorie</label><input type="text" className="form-input" value={form.categorie} onChange={e => setForm({...form, categorie: e.target.value})} placeholder="ex: Antibiotique, Antalgique, Antipaludéen" /></div>
            <div className="form-group"><label className="form-label">Code-barres</label><input type="text" className="form-input" value={form.code_barre} onChange={e => setForm({...form, code_barre: e.target.value})} placeholder="Code-barres EAN/UPC" /></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/pharmacie')}>Annuler</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : 'Créer le médicament'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
