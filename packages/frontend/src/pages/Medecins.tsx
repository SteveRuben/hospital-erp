import { useState, useEffect } from 'react';
import { getMedecins, createMedecin, updateMedecin, deleteMedecin } from '../services/api';
import type { Medecin } from '../types';

export default function Medecins() {
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Medecin | null>(null);
  const [form, setForm] = useState({ nom: '', prenom: '', specialite: '', telephone: '' });

  useEffect(() => { loadMedecins(); }, []);

  const loadMedecins = async () => {
    try { const { data } = await getMedecins(); setMedecins(data); } 
    catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await updateMedecin(editing.id, form);
      else await createMedecin(form);
      setShowModal(false); setEditing(null);
      setForm({ nom: '', prenom: '', specialite: '', telephone: '' });
      loadMedecins();
    } catch (err) { alert('Erreur'); }
  };

  const handleEdit = (m: Medecin) => { setEditing(m); setForm({ nom: m.nom, prenom: m.prenom, specialite: m.specialite || '', telephone: m.telephone || '' }); setShowModal(true); };
  const handleDelete = async (id: number) => { if (confirm('Supprimer ?')) { await deleteMedecin(id); loadMedecins(); }};

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Médecins</h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ nom: '', prenom: '', specialite: '', telephone: '' }); setShowModal(true); }}><i className="bi bi-plus-lg me-1"></i> Nouveau médecin</button>
      </div>
      <div className="card">
        <div className="card-body">
          {loading ? <div className="loading"><div className="spinner"></div></div> : (
            <table className="table table-hover">
              <thead><tr><th>Nom</th><th>Prénom</th><th>Spécialité</th><th>Téléphone</th><th>Actions</th></tr></thead>
              <tbody>
                {medecins.map(m => <tr key={m.id}><td>{m.nom}</td><td>{m.prenom}</td><td><span className="badge bg-info">{m.specialite}</span></td><td>{m.telephone}</td><td><button className="btn btn-sm btn-outline-primary me-1" onClick={() => handleEdit(m)}><i className="bi bi-pencil"></i></button><button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(m.id)}><i className="bi bi-trash"></i></button></td></tr>)}
                {medecins.length === 0 && <tr><td colSpan={5} className="text-center text-muted">Aucun médecin</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {showModal && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header"><h5 className="modal-title">{editing ? 'Modifier' : 'Nouveau'} médecin</h5><button className="btn-close" onClick={() => setShowModal(false)}></button></div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="mb-3"><label className="form-label">Nom *</label><input type="text" className="form-control" value={form.nom} onChange={(e) => setForm({...form, nom: e.target.value})} required /></div>
                  <div className="mb-3"><label className="form-label">Prénom *</label><input type="text" className="form-control" value={form.prenom} onChange={(e) => setForm({...form, prenom: e.target.value})} required /></div>
                  <div className="mb-3"><label className="form-label">Spécialité</label><input type="text" className="form-control" value={form.specialite} onChange={(e) => setForm({...form, specialite: e.target.value})} /></div>
                  <div className="mb-3"><label className="form-label">Téléphone</label><input type="tel" className="form-control" value={form.telephone} onChange={(e) => setForm({...form, telephone: e.target.value})} /></div>
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