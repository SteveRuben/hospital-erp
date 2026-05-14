import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createExamen, updateExamen, getExamen, getPatients } from '../services/api';
import type { Patient } from '../types';

const typeExamens = ['Analyse de sang', "Analyse d'urine", 'Glycémie', 'Créatinine', 'Urée', 'Cholestérol', 'Groupe sanguin', 'Sérologie', 'Test de grossesse', 'Autres'];

export default function ExamenForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState({ patient_id: '', type_examen: '', resultat: '', date_examen: '', montant: '' });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getPatients({ archived: 'false' }),
      isEdit ? getExamen(Number(id)) : Promise.resolve(null),
    ]).then(([p, e]) => {
      setPatients(p.data.data || p.data);
      if (e?.data) {
        const d = e.data as any;
        setForm({ patient_id: String(d.patient_id || ''), type_examen: d.type_examen || '', resultat: d.resultat || '', date_examen: d.date_examen ? d.date_examen.split('T')[0] : '', montant: d.montant ? String(d.montant) : '' });
      }
    }).catch(() => setError('Erreur de chargement')).finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) await updateExamen(Number(id), form);
      else await createExamen(form);
      navigate('/app/laboratoire');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/laboratoire">Laboratoire</a><span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier' : 'Nouvel examen'}</span>
      </nav>
      <div className="page-header"><h1 className="page-title">{isEdit ? 'Modifier l\'examen' : 'Nouvel examen'}</h1></div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Type d'examen *</label><select className="form-select" value={form.type_examen} onChange={e => setForm({...form, type_examen: e.target.value})} required><option value="">Sélectionner...</option>{typeExamens.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">Résultat</label><textarea className="form-input" rows={4} value={form.resultat} onChange={e => setForm({...form, resultat: e.target.value})} placeholder="Résultats de l'examen..." /></div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={form.date_examen} onChange={e => setForm({...form, date_examen: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Montant (XOF)</label><input type="number" className="form-input" value={form.montant} onChange={e => setForm({...form, montant: e.target.value})} placeholder="0" /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/laboratoire')}>Annuler</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : 'Créer l\'examen'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
