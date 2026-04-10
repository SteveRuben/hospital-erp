import { useState, useEffect } from 'react';
import { getFileAttente, getFileAttenteStats, addToFileAttente, updateFileAttenteStatut, getPatients, getServices } from '../services/api';
import type { Patient, Service } from '../types';

const prioriteConfig: Record<string, { label: string; tag: string }> = {
  urgent: { label: 'Urgent', tag: 'tag-red' },
  prioritaire: { label: 'Prioritaire', tag: 'tag-orange' },
  normal: { label: 'Normal', tag: 'tag-gray' },
};
const statutConfig: Record<string, { label: string; tag: string }> = {
  en_attente: { label: 'En attente', tag: 'tag-yellow' },
  en_cours: { label: 'En cours', tag: 'tag-blue' },
  termine: { label: 'Terminé', tag: 'tag-green' },
  absent: { label: 'Absent', tag: 'tag-red' },
};

export default function FileAttente() {
  const [queue, setQueue] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterService, setFilterService] = useState('');
  const [form, setForm] = useState({ patient_id: '', service_id: '', priorite: 'normal', notes: '' });

  useEffect(() => { loadData(); }, [filterService]);

  const loadData = async () => {
    try {
      const params: any = {};
      if (filterService) params.service_id = filterService;
      const [q, s, p, sv] = await Promise.all([getFileAttente(params), getFileAttenteStats(), getPatients({ archived: 'false' }), getServices()]);
      setQueue(q.data); setStats(s.data); setPatients(p.data); setServices(sv.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await addToFileAttente(form); setShowModal(false); setForm({ patient_id: '', service_id: '', priorite: 'normal', notes: '' }); loadData(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erreur'); }
  };

  const changeStatut = async (id: number, statut: string) => {
    try { await updateFileAttenteStatut(id, statut); loadData(); } catch { alert('Erreur'); }
  };

  const elapsed = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const enAttente = queue.filter(q => q.statut === 'en_attente');
  const enCours = queue.filter(q => q.statut === 'en_cours');

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>File d'attente</span></nav>
      <div className="page-header"><h1 className="page-title">File d'attente</h1><button className="btn-primary" onClick={() => setShowModal(true)}><i className="bi bi-plus"></i> Ajouter</button></div>

      <div className="grid-3 mb-3">
        <div className="tile stat-tile"><div className="stat-value" style={{color:'var(--cds-support-warning)'}}>{stats?.enAttente || 0}</div><div className="stat-label">En attente</div></div>
        <div className="tile stat-tile"><div className="stat-value" style={{color:'var(--cds-interactive)'}}>{stats?.enCours || 0}</div><div className="stat-label">En cours</div></div>
        <div className="tile stat-tile"><div className="stat-value text-success">{stats?.termines || 0}</div><div className="stat-label">Terminés aujourd'hui</div></div>
      </div>

      {/* Filter by service */}
      <div className="table-toolbar">
        <div className="d-flex align-center gap-2">
          <label className="form-label" style={{margin:0}}>Service :</label>
          <select className="form-select" style={{width:'200px'}} value={filterService} onChange={e => setFilterService(e.target.value)}>
            <option value="">Tous les services</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </div>
      </div>

      {/* Kanban view */}
      <div className="kanban mt-2">
        <div className="kanban-column">
          <div className="kanban-column-header"><span>En attente</span><span className="count">{enAttente.length}</span></div>
          {enAttente.map(q => (
            <div className="kanban-card" key={q.id}>
              <div className="d-flex justify-between align-center">
                <h4>#{q.numero_ordre} — {q.patient_prenom} {q.patient_nom}</h4>
                <span className={`tag ${prioriteConfig[q.priorite]?.tag}`}>{prioriteConfig[q.priorite]?.label}</span>
              </div>
              <p>{q.service_nom}</p>
              <p className="text-muted" style={{fontSize:'0.75rem'}}>Attente: {elapsed(q.date_arrivee)}</p>
              <div className="d-flex gap-1 mt-1">
                <button className="btn-ghost btn-sm" onClick={() => changeStatut(q.id, 'en_cours')}>Appeler →</button>
                <button className="btn-ghost btn-sm text-danger" onClick={() => changeStatut(q.id, 'absent')}>Absent</button>
              </div>
            </div>
          ))}
          {enAttente.length === 0 && <p className="text-muted" style={{textAlign:'center',padding:'1rem',fontSize:'0.8125rem'}}>File vide</p>}
        </div>

        <div className="kanban-column">
          <div className="kanban-column-header"><span>En cours</span><span className="count">{enCours.length}</span></div>
          {enCours.map(q => (
            <div className="kanban-card" key={q.id}>
              <div className="d-flex justify-between align-center">
                <h4>#{q.numero_ordre} — {q.patient_prenom} {q.patient_nom}</h4>
                <span className={`tag ${statutConfig.en_cours.tag}`}>En cours</span>
              </div>
              <p>{q.service_nom}</p>
              <p className="text-muted" style={{fontSize:'0.75rem'}}>Pris en charge: {q.date_prise_en_charge ? elapsed(q.date_prise_en_charge) : '-'}</p>
              <button className="btn-ghost btn-sm mt-1" onClick={() => changeStatut(q.id, 'termine')}>Terminer ✓</button>
            </div>
          ))}
          {enCours.length === 0 && <p className="text-muted" style={{textAlign:'center',padding:'1rem',fontSize:'0.8125rem'}}>Personne en cours</p>}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Ajouter à la file</h3><button className="btn-icon" onClick={() => setShowModal(false)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleSubmit}><div className="modal-body">
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Service *</label><select className="form-select" value={form.service_id} onChange={e => setForm({...form, service_id: e.target.value})} required><option value="">Sélectionner...</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Priorité</label><select className="form-select" value={form.priorite} onChange={e => setForm({...form, priorite: e.target.value})}><option value="normal">Normal</option><option value="prioritaire">Prioritaire</option><option value="urgent">Urgent</option></select></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button type="submit" className="btn-primary">Ajouter</button></div></form>
        </div></div>
      )}
    </div>
  );
}