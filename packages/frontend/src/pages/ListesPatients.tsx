import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getListesPatients, getListePatients, createListePatients, deleteListePatients, addPatientToListe, removePatientFromListe, getPatients } from '../services/api';
import type { Patient } from '../types';

export default function ListesPatients() {
  const [listes, setListes] = useState<any[]>([]);
  const [selectedListe, setSelectedListe] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [createForm, setCreateForm] = useState({ nom: '', description: '' });
  const [addPatientId, setAddPatientId] = useState('');
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [l, p] = await Promise.all([getListesPatients(), getPatients({ archived: 'false' })]);
      setListes(l.data); setPatients(p.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const selectListe = async (id: number) => {
    try { const { data } = await getListePatients(id); setSelectedListe(data); }
    catch (err) { console.error(err); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await createListePatients(createForm); setShowCreateModal(false); setCreateForm({ nom: '', description: '' }); loadData(); }
    catch { alert('Erreur'); }
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListe || !addPatientId) return;
    try { await addPatientToListe(selectedListe.id, Number(addPatientId)); setShowAddModal(false); setAddPatientId(''); selectListe(selectedListe.id); loadData(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erreur'); }
  };

  const handleRemovePatient = async (patientId: number) => {
    if (!selectedListe) return;
    try { await removePatientFromListe(selectedListe.id, patientId); selectListe(selectedListe.id); loadData(); }
    catch { alert('Erreur'); }
  };

  const handleDeleteListe = async (id: number) => {
    if (!confirm('Supprimer cette liste ?')) return;
    try { await deleteListePatients(id); setSelectedListe(null); loadData(); }
    catch { alert('Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Listes de patients</span></nav>
      <div className="page-header"><h1 className="page-title">Listes de patients</h1><button className="btn-primary" onClick={() => setShowCreateModal(true)}><i className="bi bi-plus"></i> Nouvelle liste</button></div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1rem' }}>
        {/* Sidebar: list of lists */}
        <div>
          {listes.map(l => (
            <div key={l.id} className={`tile tile-clickable mb-1 ${selectedListe?.id === l.id ? 'active' : ''}`} style={{ borderLeft: selectedListe?.id === l.id ? '3px solid var(--cds-interactive)' : '3px solid transparent' }} onClick={() => selectListe(l.id)}>
              <div className="d-flex justify-between align-center">
                <strong style={{ fontSize: '0.875rem' }}>{l.nom}</strong>
                <span className="tag tag-blue">{l.nb_patients}</span>
              </div>
              {l.description && <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{l.description}</p>}
            </div>
          ))}
          {listes.length === 0 && <div className="table-empty"><i className="bi bi-list-ul" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Aucune liste</div>}
        </div>

        {/* Main: selected list details */}
        <div>
          {selectedListe ? (
            <div>
              <div className="d-flex justify-between align-center mb-2">
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selectedListe.nom}</h2>
                  {selectedListe.description && <p className="text-muted">{selectedListe.description}</p>}
                </div>
                <div className="d-flex gap-1">
                  <button className="btn-primary btn-sm" onClick={() => setShowAddModal(true)}><i className="bi bi-person-plus"></i> Ajouter patient</button>
                  <button className="btn-icon" onClick={() => handleDeleteListe(selectedListe.id)}><i className="bi bi-trash text-danger"></i></button>
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>ID</th><th>Nom</th><th>Prénom</th><th>Sexe</th><th>Téléphone</th><th></th></tr></thead>
                <tbody>
                  {selectedListe.patients?.map((p: any) => (
                    <tr key={p.patient_id}>
                      <td>#{p.patient_id}</td>
                      <td style={{ cursor: 'pointer', color: 'var(--cds-interactive)' }} onClick={() => navigate(`/app/patients/${p.patient_id}`)}>{p.nom}</td>
                      <td>{p.prenom}</td>
                      <td>{p.sexe === 'M' ? <span className="tag tag-blue">M</span> : p.sexe === 'F' ? <span className="tag tag-purple">F</span> : '-'}</td>
                      <td>{p.telephone || '-'}</td>
                      <td><button className="btn-icon" onClick={() => handleRemovePatient(p.patient_id)}><i className="bi bi-x-lg"></i></button></td>
                    </tr>
                  ))}
                  {(!selectedListe.patients || selectedListe.patients.length === 0) && <tr><td colSpan={6} className="table-empty">Aucun patient dans cette liste</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-empty" style={{ marginTop: '3rem' }}><i className="bi bi-arrow-left" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Sélectionnez une liste</div>
          )}
        </div>
      </div>

      {/* Create list modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouvelle liste</h3><button className="btn-icon" onClick={() => setShowCreateModal(false)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleCreate}><div className="modal-body">
            <div className="form-group"><label className="form-label">Nom *</label><input type="text" className="form-input" value={createForm.nom} onChange={e => setCreateForm({...createForm, nom: e.target.value})} required placeholder="ex: Patients diabétiques" /></div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" rows={2} value={createForm.description} onChange={e => setCreateForm({...createForm, description: e.target.value})} /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>Annuler</button><button type="submit" className="btn-primary">Créer</button></div></form>
        </div></div>
      )}

      {/* Add patient modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Ajouter un patient</h3><button className="btn-icon" onClick={() => setShowAddModal(false)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleAddPatient}><div className="modal-body">
            <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={addPatientId} onChange={e => setAddPatientId(e.target.value)} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>Annuler</button><button type="submit" className="btn-primary">Ajouter</button></div></form>
        </div></div>
      )}
    </div>
  );
}