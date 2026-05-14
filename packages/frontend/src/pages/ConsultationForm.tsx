import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createConsultation, updateConsultation, getConsultation, getPatients, getMedecins, getServices } from '../services/api';
import type { Patient, Medecin, Service } from '../types';

export default function ConsultationForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState({ patient_id: '', medecin_id: '', service_id: '', diagnostic: '', traitement: '', notes: '', motif: '' });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getPatients({ archived: 'false' }),
      getMedecins(),
      getServices(),
      isEdit ? getConsultation(Number(id)) : Promise.resolve(null),
    ]).then(([p, m, s, c]) => {
      setPatients(p.data.data || p.data);
      setMedecins(m.data);
      setServices(s.data);
      if (c?.data) {
        const d = c.data as any;
        setForm({ patient_id: String(d.patient_id || ''), medecin_id: String(d.medecin_id || ''), service_id: String(d.service_id || ''), diagnostic: d.diagnostic || '', traitement: d.traitement || '', notes: d.notes || '', motif: d.motif || '' });
      }
    }).catch(() => setError('Erreur de chargement')).finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) await updateConsultation(Number(id), form);
      else await createConsultation(form);
      navigate('/app/consultations');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de l\'enregistrement');
    }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/consultations">Consultations</a><span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier' : 'Nouvelle consultation'}</span>
      </nav>
      <div className="page-header">
        <h1 className="page-title">{isEdit ? 'Modifier la consultation' : 'Nouvelle consultation'}</h1>
      </div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid-3">
            <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Médecin *</label><select className="form-select" value={form.medecin_id} onChange={e => setForm({...form, medecin_id: e.target.value})} required><option value="">Sélectionner...</option>{medecins.map(m => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Service</label><select className="form-select" value={form.service_id} onChange={e => setForm({...form, service_id: e.target.value})}><option value="">Sélectionner...</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">Motif de consultation</label><textarea className="form-input" rows={2} value={form.motif} onChange={e => setForm({...form, motif: e.target.value})} placeholder="Raison de la visite..." /></div>
          <div className="form-group"><label className="form-label">Diagnostic</label><textarea className="form-input" rows={3} value={form.diagnostic} onChange={e => setForm({...form, diagnostic: e.target.value})} placeholder="Diagnostic médical..." /></div>
          <div className="form-group"><label className="form-label">Traitement</label><textarea className="form-input" rows={3} value={form.traitement} onChange={e => setForm({...form, traitement: e.target.value})} placeholder="Plan de traitement..." /></div>
          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Notes additionnelles..." /></div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/consultations')}>Annuler</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : 'Créer la consultation'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
