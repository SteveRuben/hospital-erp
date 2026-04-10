import { useState, useEffect } from 'react';
import { getRendezVous, createRendezVous, updateRendezVousStatut, deleteRendezVous, getPatients, getMedecins, getServices } from '../services/api';
import type { RendezVous as RDV, Patient, Medecin, Service } from '../types';

const statutConfig: Record<string, { label: string; tag: string }> = {
  planifie: { label: 'Planifié', tag: 'tag-gray' },
  confirme: { label: 'Confirmé', tag: 'tag-blue' },
  en_cours: { label: 'En cours', tag: 'tag-yellow' },
  termine: { label: 'Terminé', tag: 'tag-green' },
  annule: { label: 'Annulé', tag: 'tag-red' },
  absent: { label: 'Absent', tag: 'tag-orange' },
};

export default function RendezVous() {
  const [rdvs, setRdvs] = useState<RDV[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ patient_id: '', medecin_id: '', service_id: '', date_rdv: '', motif: '', notes: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [r, p, m, s] = await Promise.all([getRendezVous(), getPatients({ archived: 'false' }), getMedecins(), getServices()]);
      setRdvs(r.data); setPatients(p.data); setMedecins(m.data); setServices(s.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await createRendezVous(form); setShowModal(false); setForm({ patient_id: '', medecin_id: '', service_id: '', date_rdv: '', motif: '', notes: '' }); loadData(); } catch { alert('Erreur'); }
  };

  const changeStatut = async (id: number, statut: string) => {
    try { await updateRendezVousStatut(id, statut); loadData(); } catch { alert('Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const today = new Date().toISOString().split('T')[0];
  const rdvsToday = rdvs.filter(r => r.date_rdv.startsWith(today));
  const rdvsUpcoming = rdvs.filter(r => r.date_rdv > today);

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Rendez-vous</span></nav>
      <div className="page-header"><h1 className="page-title">Rendez-vous</h1><button className="btn-primary" onClick={() => setShowModal(true)}><i className="bi bi-plus"></i> Nouveau RDV</button></div>

      <div className="grid-4 mb-3">
        <div className="tile stat-tile"><div className="stat-value">{rdvsToday.length}</div><div className="stat-label">Aujourd'hui</div></div>
        <div className="tile stat-tile"><div className="stat-value">{rdvsToday.filter(r => r.statut === 'confirme').length}</div><div className="stat-label">Confirmés</div></div>
        <div className="tile stat-tile"><div className="stat-value">{rdvsToday.filter(r => r.statut === 'en_cours').length}</div><div className="stat-label">En cours</div></div>
        <div className="tile stat-tile"><div className="stat-value">{rdvsUpcoming.length}</div><div className="stat-label">À venir</div></div>
      </div>

      <div className="tabs mb-2">
        <button className="tab-item active">Aujourd'hui</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Heure</th><th>Patient</th><th>Médecin</th><th>Service</th><th>Motif</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          {rdvs.map(r => (
            <tr key={r.id}>
              <td>{new Date(r.date_rdv).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
              <td>{r.patient_prenom} {r.patient_nom}</td>
              <td>Dr. {r.medecin_prenom} {r.medecin_nom}</td>
              <td>{r.service_nom}</td>
              <td>{r.motif || '-'}</td>
              <td><span className={`tag ${statutConfig[r.statut]?.tag}`}>{statutConfig[r.statut]?.label}</span></td>
              <td>
                <div className="d-flex gap-1">
                  {r.statut === 'planifie' && <button className="btn-ghost btn-sm" onClick={() => changeStatut(r.id, 'confirme')}>Confirmer</button>}
                  {r.statut === 'confirme' && <button className="btn-ghost btn-sm" onClick={() => changeStatut(r.id, 'en_cours')}>Démarrer</button>}
                  {r.statut === 'en_cours' && <button className="btn-ghost btn-sm" onClick={() => changeStatut(r.id, 'termine')}>Terminer</button>}
                  {['planifie', 'confirme'].includes(r.statut) && <button className="btn-ghost btn-sm text-danger" onClick={() => changeStatut(r.id, 'annule')}>Annuler</button>}
                  <button className="btn-icon" onClick={async () => { if (confirm('Supprimer ?')) { await deleteRendezVous(r.id); loadData(); }}}><i className="bi bi-trash"></i></button>
                </div>
              </td>
            </tr>
          ))}
          {rdvs.length === 0 && <tr><td colSpan={7} className="table-empty"><i className="bi bi-calendar-event"></i>Aucun rendez-vous</td></tr>}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Nouveau rendez-vous</h3><button className="btn-icon" onClick={() => setShowModal(false)}><i className="bi bi-x-lg"></i></button></div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Médecin</label><select className="form-select" value={form.medecin_id} onChange={e => setForm({...form, medecin_id: e.target.value})}><option value="">Sélectionner...</option>{medecins.map(m => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>)}</select></div>
                </div>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Service</label><select className="form-select" value={form.service_id} onChange={e => setForm({...form, service_id: e.target.value})}><option value="">Sélectionner...</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Date et heure *</label><input type="datetime-local" className="form-input" value={form.date_rdv} onChange={e => setForm({...form, date_rdv: e.target.value})} required /></div>
                </div>
                <div className="form-group"><label className="form-label">Motif</label><input type="text" className="form-input" value={form.motif} onChange={e => setForm({...form, motif: e.target.value})} /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button type="submit" className="btn-primary">Planifier</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}