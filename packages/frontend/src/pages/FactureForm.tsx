import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTarifs, createFacture } from '../services/api';
import { useSnackbar } from '../components/Snackbar';
import PatientTypeahead from '../components/PatientTypeahead';

interface Ligne {
  tarif_id: string;
  libelle: string;
  quantite: number;
  prix_unitaire: number;
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(n);

export default function FactureForm() {
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const [patientId, setPatientId] = useState('');
  const [lignes, setLignes] = useState<Ligne[]>([{ tarif_id: '', libelle: '', quantite: 1, prix_unitaire: 0 }]);
  const [notes, setNotes] = useState('');
  const [tarifs, setTarifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getTarifs().then(({ data }) => setTarifs(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const total = lignes.reduce((s, l) => s + l.prix_unitaire * l.quantite, 0);

  const addLigne = () => setLignes([...lignes, { tarif_id: '', libelle: '', quantite: 1, prix_unitaire: 0 }]);
  const removeLigne = (i: number) => setLignes(lignes.filter((_, idx) => idx !== i));
  const updateLigne = (i: number, field: keyof Ligne, value: string | number) => {
    const next = [...lignes];
    (next[i] as any)[field] = value;
    if (field === 'tarif_id' && value) {
      const t = tarifs.find((t: any) => t.id === Number(value));
      if (t) { next[i].libelle = t.libelle; next[i].prix_unitaire = parseFloat(t.montant); }
    }
    setLignes(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = lignes.filter(l => l.libelle && l.prix_unitaire > 0);
    if (!patientId) { showSnackbar('Sélectionnez un patient', 'warning'); return; }
    if (valid.length === 0) { showSnackbar('Ajoutez au moins une ligne valide', 'warning'); return; }
    setSubmitting(true);
    setError('');
    try {
      await createFacture({ patient_id: Number(patientId), lignes: valid, notes: notes || undefined });
      showSnackbar('Facture créée', 'success');
      navigate('/app/facturation');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/facturation">Facturation</a><span className="breadcrumb-separator">/</span>
        <span>Nouvelle facture</span>
      </nav>
      <div className="page-header"><h1 className="page-title">Nouvelle facture</h1></div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Patient *</label>
            <PatientTypeahead value={patientId} onChange={id => setPatientId(id)} required autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes optionnelles..." />
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <div className="d-flex justify-between align-center mb-1">
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Lignes de facturation</h4>
              <button type="button" className="btn-ghost btn-sm" onClick={addLigne}><i className="bi bi-plus"></i> Ajouter une ligne</button>
            </div>

            {lignes.map((l, i) => (
              <div key={i} className="d-flex gap-1 align-center mb-1" style={{ alignItems: 'flex-start' }}>
                <select className="form-select" style={{ width: '200px' }} value={l.tarif_id} onChange={e => updateLigne(i, 'tarif_id', e.target.value)}>
                  <option value="">Tarif (optionnel)</option>
                  {tarifs.map((t: any) => <option key={t.id} value={t.id}>{t.code} - {t.libelle}</option>)}
                </select>
                <input type="text" className="form-input" style={{ flex: 1 }} value={l.libelle} onChange={e => updateLigne(i, 'libelle', e.target.value)} placeholder="Désignation" />
                <input type="number" className="form-input" style={{ width: '60px' }} value={l.quantite} onChange={e => updateLigne(i, 'quantite', parseInt(e.target.value) || 1)} min={1} />
                <input type="number" className="form-input" style={{ width: '120px' }} value={l.prix_unitaire || ''} onChange={e => updateLigne(i, 'prix_unitaire', parseFloat(e.target.value) || 0)} placeholder="Prix unitaire" min="0" />
                <span style={{ width: '100px', textAlign: 'right', fontWeight: 600, fontSize: '0.8125rem' }}>{fmt(l.prix_unitaire * l.quantite)}</span>
                {lignes.length > 1 && <button type="button" className="btn-icon" onClick={() => removeLigne(i)}><i className="bi bi-x"></i></button>}
              </div>
            ))}

            <div style={{ textAlign: 'right', marginTop: '1rem', fontSize: '1.25rem', fontWeight: 600 }}>
              Total: {fmt(total)}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/facturation')}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Création...' : 'Créer la facture'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
