import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getAssurancesAdmin, createAssurance, updateAssurance,
  type AssuranceAdminRow,
} from '../services/api';
import { useSnackbar } from '../components/Snackbar';

export default function AssuranceForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nom: '',
    code: '',
    contact: '',
    taux_defaut: '70',
    actif: true,
  });

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    getAssurancesAdmin()
      .then(({ data }) => {
        const found = data.find((a: AssuranceAdminRow) => a.id === Number(id));
        if (!found) { showSnackbar('Assurance introuvable', 'error'); navigate('/app/assurances'); return; }
        setForm({
          nom: found.nom,
          code: found.code ?? '',
          contact: found.contact ?? '',
          taux_defaut: String(found.tauxDefaut ?? 70),
          actif: found.actif,
        });
      })
      .catch(() => { showSnackbar('Erreur de chargement', 'error'); navigate('/app/assurances'); })
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom.trim()) { showSnackbar('Nom requis', 'warning'); return; }
    setSaving(true);
    try {
      const payload = {
        nom: form.nom.trim(),
        code: form.code.trim() || undefined,
        contact: form.contact.trim() || undefined,
        taux_defaut: Number(form.taux_defaut) || 70,
      };
      if (isEdit) {
        await updateAssurance(Number(id), { ...payload, actif: form.actif });
        showSnackbar('Assurance mise à jour', 'success');
      } else {
        await createAssurance(payload);
        showSnackbar('Assurance créée', 'success');
      }
      navigate('/app/assurances');
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a>
        <span className="breadcrumb-separator">/</span>
        <a href="/app/assurances">Assurances</a>
        <span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier l\'assurance' : 'Nouvelle assurance'}</span>
      </nav>

      <div className="page-header">
        <h1 className="page-title">{isEdit ? 'Modifier l\'assurance' : 'Nouvelle assurance'}</h1>
      </div>

      <div className="tile" style={{ maxWidth: '640px', padding: '1.5rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nom *</label>
            <input
              type="text"
              className="form-input"
              value={form.nom}
              onChange={e => setForm({ ...form, nom: e.target.value })}
              autoFocus
              required
            />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Code court</label>
              <input
                type="text"
                className="form-input"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="ex: MN"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Taux défaut (%)</label>
              <input
                type="number"
                className="form-input"
                value={form.taux_defaut}
                onChange={e => setForm({ ...form, taux_defaut: e.target.value })}
                min={0}
                max={100}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Contact</label>
            <input
              type="text"
              className="form-input"
              value={form.contact}
              onChange={e => setForm({ ...form, contact: e.target.value })}
              placeholder="email ou téléphone"
            />
          </div>

          {isEdit && (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.actif}
                  onChange={e => setForm({ ...form, actif: e.target.checked })}
                />
                <span>Actif (visible dans le picker du modal de paiement)</span>
              </label>
            </div>
          )}

          <div className="d-flex gap-1" style={{ marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/assurances')}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
