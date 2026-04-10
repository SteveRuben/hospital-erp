import { useState, useEffect } from 'react';
import { getConsultations, createConsultation, updateConsultation, deleteConsultation, getPatients, getMedecins, getServices } from '../services/api';
import type { Consultation, Patient, Medecin, Service } from '../types';

export default function Consultations() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Consultation | null>(null);
  const [form, setForm] = useState({ patient_id: '', medecin_id: '', service_id: '', diagnostic: '', traitement: '', notes: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [c, p, m, s] = await Promise.all([getConsultations(), getPatients({ archived: 'false' }), getMedecins(), getServices()]);
      setConsultations(c.data); setPatients(p.data); setMedecins(m.data); setServices(s.data);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await updateConsultation(editing.id, form);
      else await createConsultation(form);
      setShowModal(false); setEditing(null);
      setForm({ patient_id: '', medecin_id: '', service_id: '', diagnostic: '', traitement: '', notes: '' });
      loadData();
    } catch (err) { alert('Erreur'); }
  };

  const handleEdit = (c: Consultation) => { setEditing(c); setForm({ patient_id: String(c.patient_id), medecin_id: String(c.medecin_id), service_id: String(c.service_id), diagnostic: c.diagnostic || '', traitement: c.traitement || '', notes: c.notes || '' }); setShowModal(true); };
  const handleDelete = async (id: number) => { if (confirm('Supprimer ?')) { await deleteConsultation(id); loadData(); }};

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Consultations</h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ patient_id: '', medecin_id: '', service_id: '', diagnostic: '', traitement: '', notes: '' }); setShowModal(true); }}><i className="bi bi-plus-lg me-1"></i> Nouvelle</button>
      </div>
      <div className="card">
        <div className="card-body">
          {loading ? <div className="loading"><div className="spinner"></div></div> : (
            <table className="table table-hover">
              <thead><tr><th>Date</th><th>Patient</th><th>Médecin</th><th>Service</th><th>Diagnostic</th><th>Actions</th></tr></thead>
              <tbody>
                {consultations.map(c => <tr key={c.id}><td>{new Date(c.date_consultation).toLocaleDateString('fr-FR')}</td><td>{c.patient_prenom} {c.patient_nom}</td><td>Dr. {c.medecin_prenom} {c.medecin_nom}</td><td>{c.service_nom}</td><td>{c.diagnostic?.substring(0, 30)}...</td><td><button className="btn btn-sm btn-outline-primary me-1" onClick={() => handleEdit(c)}><i className="bi bi-pencil"></i></button><button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(c.id)}><i className="bi bi-trash"></i></button></td></tr>)}
                {consultations.length === 0 && <tr><td colSpan={6} className="text-center text-muted">Aucune consultation</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {showModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header"><h5 className="modal-title">{editing ? 'Modifier' : 'Nouvelle'} consultation</h5><button className="btn-close" onClick={() => setShowModal(false)}></button></div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-4"><label className="form-label">Patient *</label><select className="form-select" value={form.patient_id} onChange={(e) => setForm({...form, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
                    <div className="col-md-4"><label className="form-label">Médecin *</label><select className="form-select" value={form.medecin_id} onChange={(e) => setForm({...form, medecin_id: e.target.value})} required><option value="">Sélectionner...</option>{medecins.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}</select></div>
                    <div className="col-md-4"><label className="form-label">Service *</label><select className="form-select" value={form.service_id} onChange={(e) => setForm({...form, service_id: e.target.value})} required><option value="">Sélectionner...</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
                    <div className="col-12"><label className="form-label">Diagnostic</label><textarea className="form-control" rows={2} value={form.diagnostic} onChange={(e) => setForm({...form, diagnostic: e.target.value})} /></div>
                    <div className="col-12"><label className="form-label">Traitement</label><textarea className="form-control" rows={2} value={form.traitement} onChange={(e) => setForm({...form, traitement: e.target.value})} /></div>
                  </div>
                </div>
                <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button type="submit" className="btn btn-primary">Enregistrer</button></div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}