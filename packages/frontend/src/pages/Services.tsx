import { useState, useEffect } from 'react';
import { getServices, createService, updateService, deleteService } from '../services/api';
import type { Service } from '../types';

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState({ nom: '', description: '' });

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    try { const { data } = await getServices(); setServices(data); } 
    catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await updateService(editing.id, form);
      else await createService(form);
      setShowModal(false); setEditing(null);
      setForm({ nom: '', description: '' });
      loadServices();
    } catch (err) { alert('Erreur'); }
  };

  const handleEdit = (s: Service) => { setEditing(s); setForm(s); setShowModal(true); };
  const handleDelete = async (id: number) => { if (confirm('Supprimer ?')) { await deleteService(id); loadServices(); }};

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Services</h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ nom: '', description: '' }); setShowModal(true); }}><i className="bi bi-plus-lg me-1"></i> Nouveau service</button>
      </div>
      <div className="card">
        <div className="card-body">
          {loading ? <div className="loading"><div className="spinner"></div></div> : (
            <div className="row g-3">
              {services.map(s => (
                <div className="col-md-4" key={s.id}>
                  <div className="card h-100 border">
                    <div className="card-body"><h5 className="card-title">{s.nom}</h5><p className="card-text text-muted">{s.description || 'Aucune description'}</p></div>
                    <div className="card-footer bg-white"><button className="btn btn-sm btn-outline-primary me-1" onClick={() => handleEdit(s)}><i className="bi bi-pencil"></i></button><button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(s.id)}><i className="bi bi-trash"></i></button></div>
                  </div>
                </div>
              ))}
              {services.length === 0 && <div className="col-12 text-center text-muted">Aucun service</div>}
            </div>
          )}
        </div>
      </div>
      {showModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header"><h5 className="modal-title">{editing ? 'Modifier' : 'Nouveau'} service</h5><button className="btn-close" onClick={() => setShowModal(false)}></button></div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="mb-3"><label className="form-label">Nom *</label><input type="text" className="form-control" value={form.nom} onChange={(e) => setForm({...form, nom: e.target.value})} required /></div>
                  <div className="mb-3"><label className="form-label">Description</label><textarea className="form-control" rows={3} value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} /></div>
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