import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createHospitalisation, getPatients, getMedecins, getServices, getLits } from '../services/api';
import type { Patient, Medecin, Service } from '../types';

export default function AdmissionForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ patient_id: '', lit_id: '', medecin_id: '', service_id: '', motif: '', notes: '' });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [lits, setLits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getPatients({ archived: 'false' }), getMedecins(), getServices(), getLits()])
      .then(([p, m, s, l]) => {
        setPatients(p.data.data || p.data);
        setMedecins(m.data);
        setServices(s.data);
        setLits((l.data as any[]).filter((lit: any) => lit.statut === 'disponible'));
      }).catch(() => setError('Erreur de chargement')).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await createHospitalisation(form);
      navigate('/app/lits');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur lors de l\'admission'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/lits">Lits & Hospitalisations</a><span className="breadcrumb-separator">/</span>
        <span>Nouvelle admission</span>
      </nav>
      <div className="page-header"><h1 className="page-title">Nouvelle admission</h1></div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Lit disponible</label><select className="form-select" value={form.lit_id} onChange={e => setForm({...form, lit_id: e.target.value})}><option value="">Sélectionner...</option>{lits.map((l: any) => <option key={l.id} value={l.id}>{l.numero} — {l.pavillon_nom} ({l.type_lit})</option>)}</select></div>
          </div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Médecin responsable</label><select className="form-select" value={form.medecin_id} onChange={e => setForm({...form, medecin_id: e.target.value})}><option value="">Sélectionner...</option>{medecins.map(m => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom} — {m.specialite}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Service</label><select className="form-select" value={form.service_id} onChange={e => setForm({...form, service_id: e.target.value})}><option value="">Sélectionner...</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">Motif d'hospitalisation</label><textarea className="form-input" rows={3} value={form.motif} onChange={e => setForm({...form, motif: e.target.value})} placeholder="Raison de l'hospitalisation..." /></div>
          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Notes additionnelles..." /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/lits')}>Annuler</button>
            <button type="submit" className="btn-primary">Admettre le patient</button>
          </div>
        </form>
      </div>
    </div>
  );
}
