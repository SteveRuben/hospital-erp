import { useState, useEffect } from 'react';
import { getVisites, getVisitesStats, createVisite, terminerVisite, getPatients, getServices } from '../services/api';
import type { Patient, Service } from '../types';

const typeLabels: Record<string, { label: string; tag: string }> = {
  ambulatoire: { label: 'Ambulatoire', tag: 'tag-blue' },
  hospitalisation: { label: 'Hospitalisation', tag: 'tag-purple' },
  urgence: { label: 'Urgence', tag: 'tag-red' },
};

export default function Visites() {
  const [visites, setVisites] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ patient_id: '', service_id: '', type_visite: 'ambulatoire', notes: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [v, s, p, sv] = await Promise.all([getVisites(), getVisitesStats(), getPatients({ archived: 'false' }), getServices()]);
      setVisites(v.data); setStats(s.data); setPatients(p.data); setServices(sv.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await createVisite(form); setShowModal(false); setForm({ patient_id: '', service_id: '', type_visite: 'ambulatoire', notes: '' }); loadData(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erreur'); }
  };

  const handleTerminer = async (id: number) => {
    try { await terminerVisite(id); loadData(); } catch { alert('Erreur'); }
  };

  const elapsed = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 60) return `${mins}min`;
    return `${Math.floor(mins / 60)}h${mins % 60}min`;
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Visites actives</span></nav>
      <div className="page-header"><h1 className="page-title">Visites actives</h1><button className="btn-primary" onClick={() => setShowModal(true)}><i className="bi bi-plus"></i> Nouvelle visite</button></div>

      <div className="grid-4 mb-3">
        <div className="tile stat-tile"><div className="stat-value">{stats?.actives || 0}</div><div className="stat-label">Visites actives</div></div>
        <div className="tile stat-tile"><div className="stat-value">{stats?.today || 0}</div><div className="stat-label">Total aujourd'hui</div></div>
        <div className="tile stat-tile"><div className="stat-value">{stats?.parType?.find((t: any) => t.type_visite === 'urgence')?.total || 0}</div><div className="stat-label">Urgences</div></div>
        <div className="tile stat-tile"><div className="stat-value">{stats?.parType?.find((t: any) => t.type_visite === 'hospitalisation')?.total || 0}</div><div className="stat-label">Hospitalisations</div></div>
      </div>

      <table className="data-table">
        <thead><tr><th>Patient</th><th>Service</th><th>Type</th><th>Début</th><th>Durée</th><th>Actions</th></tr></thead>
        <tbody>
          {visites.map(v => (
            <tr key={v.id}>
              <td className="fw-600">{v.patient_prenom} {v.patient_nom}</td>
              <td>{v.service_nom || '-'}</td>
              <td><span className={`tag ${typeLabels[v.type_visite]?.tag || 'tag-gray'}`}>{typeLabels[v.type_visite]?.label || v.type_visite}</span></td>
              <td>{new Date(v.date_debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
              <td>{elapsed(v.date_debut)}</td>
              <td><button className="btn-ghost btn-sm" onClick={() => handleTerminer(v.id)}>Terminer ✓</button></td>
            </tr>
          ))}
          {visites.length === 0 && <tr><td colSpan={6} className="table-empty"><i className="bi bi-door-open" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Aucune visite active</td></tr>}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouvelle visite</h3><button className="btn-icon" onClick={() => setShowModal(false)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleSubmit}><div className="modal-body">
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Service</label><select className="form-select" value={form.service_id} onChange={e => setForm({...form, service_id: e.target.value})}><option value="">Sélectionner...</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Type de visite</label><select className="form-select" value={form.type_visite} onChange={e => setForm({...form, type_visite: e.target.value})}><option value="ambulatoire">Ambulatoire</option><option value="hospitalisation">Hospitalisation</option><option value="urgence">Urgence</option></select></div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button type="submit" className="btn-primary">Démarrer la visite</button></div></form>
        </div></div>
      )}
    </div>
  );
}