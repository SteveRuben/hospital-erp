import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProgrammes, getProgramme, createProgramme, addPatientToProgramme, deleteProgramme, getPatients } from '../services/api';
import type { Patient } from '../types';

export default function Programmes() {
  const [programmes, setProgrammes] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [createForm, setCreateForm] = useState({ nom: '', description: '', type_programme: '' });
  const [addPatientId, setAddPatientId] = useState('');
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [p, pat] = await Promise.all([getProgrammes(), getPatients({ archived: 'false' })]);
      setProgrammes(p.data); setPatients(pat.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const selectProg = async (id: number) => { try { const { data } = await getProgramme(id); setSelected(data); } catch (err) { console.error(err); } };

  const handleCreate = async (e: React.FormEvent) => { e.preventDefault(); try { await createProgramme(createForm); setShowCreate(false); setCreateForm({ nom: '', description: '', type_programme: '' }); loadData(); } catch { alert('Erreur'); } };

  const handleAddPatient = async (e: React.FormEvent) => { e.preventDefault(); if (!selected || !addPatientId) return; try { await addPatientToProgramme(selected.id, Number(addPatientId)); setShowAdd(false); setAddPatientId(''); selectProg(selected.id); loadData(); } catch (err: any) { alert(err.response?.data?.error || 'Erreur'); } };

  const handleDelete = async (id: number) => { if (!confirm('Supprimer ce programme ?')) return; try { await deleteProgramme(id); setSelected(null); loadData(); } catch { alert('Erreur'); } };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Programmes de soins</span></nav>
      <div className="page-header"><h1 className="page-title">Programmes de soins</h1><button className="btn-primary" onClick={() => setShowCreate(true)}><i className="bi bi-plus"></i> Nouveau programme</button></div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem' }}>
        {/* Liste des programmes */}
        <div>
          {programmes.map((p: any) => (
            <div key={p.id} className="tile tile-clickable mb-1" style={{ padding: '1rem', borderLeft: selected?.id === p.id ? '3px solid var(--cds-interactive)' : '3px solid transparent', cursor: 'pointer' }} onClick={() => selectProg(p.id)}>
              <div className="d-flex justify-between align-center">
                <strong style={{ fontSize: '0.875rem' }}>{p.nom}</strong>
                <span className="tag tag-blue">{p.nb_patients} patients</span>
              </div>
              {p.type_programme && <span className="tag tag-gray" style={{ marginTop: '0.25rem' }}>{p.type_programme}</span>}
              {p.description && <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{p.description}</p>}
            </div>
          ))}
          {programmes.length === 0 && <div className="table-empty"><i className="bi bi-heart-pulse" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Aucun programme</div>}
        </div>

        {/* Détail du programme */}
        <div>
          {selected ? (
            <div>
              <div className="d-flex justify-between align-center mb-2">
                <div><h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selected.nom}</h2>{selected.description && <p className="text-muted">{selected.description}</p>}</div>
                <div className="d-flex gap-1">
                  <button className="btn-primary btn-sm" onClick={() => setShowAdd(true)}><i className="bi bi-person-plus"></i> Inscrire patient</button>
                  <button className="btn-icon" onClick={() => handleDelete(selected.id)}><i className="bi bi-trash text-danger"></i></button>
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Patient</th><th>Sexe</th><th>Téléphone</th><th>Inscrit le</th><th>Statut</th></tr></thead>
                <tbody>
                  {selected.patients?.map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ cursor: 'pointer', color: 'var(--cds-interactive)' }} onClick={() => navigate(`/app/patients/${p.patient_id}`)}>{p.prenom} {p.nom}</td>
                      <td>{p.sexe === 'M' ? <span className="tag tag-blue">M</span> : p.sexe === 'F' ? <span className="tag tag-purple">F</span> : '-'}</td>
                      <td>{p.telephone || '-'}</td>
                      <td>{new Date(p.date_inscription).toLocaleDateString('fr-FR')}</td>
                      <td><span className={`tag ${p.statut === 'actif' ? 'tag-green' : p.statut === 'termine' ? 'tag-gray' : 'tag-red'}`}>{p.statut}</span></td>
                    </tr>
                  ))}
                  {(!selected.patients || selected.patients.length === 0) && <tr><td colSpan={5} className="table-empty">Aucun patient inscrit</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-empty" style={{ marginTop: '3rem' }}><i className="bi bi-arrow-left" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Sélectionnez un programme</div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouveau programme</h3><button className="btn-icon" onClick={() => setShowCreate(false)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleCreate}><div className="modal-body">
            <div className="form-group"><label className="form-label">Nom *</label><input type="text" className="form-input" value={createForm.nom} onChange={e => setCreateForm({...createForm, nom: e.target.value})} required placeholder="ex: Suivi Diabète" /></div>
            <div className="form-group"><label className="form-label">Type</label><input type="text" className="form-input" value={createForm.type_programme} onChange={e => setCreateForm({...createForm, type_programme: e.target.value})} placeholder="ex: Chronique, Maternité, VIH" /></div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" rows={2} value={createForm.description} onChange={e => setCreateForm({...createForm, description: e.target.value})} /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Annuler</button><button type="submit" className="btn-primary">Créer</button></div></form>
        </div></div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Inscrire un patient</h3><button className="btn-icon" onClick={() => setShowAdd(false)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleAddPatient}><div className="modal-body">
            <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={addPatientId} onChange={e => setAddPatientId(e.target.value)} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Annuler</button><button type="submit" className="btn-primary">Inscrire</button></div></form>
        </div></div>
      )}
    </div>
  );
}