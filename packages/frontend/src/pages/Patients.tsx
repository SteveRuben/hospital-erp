import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPatients, deletePatient } from '../services/api';
import type { Patient } from '../types';

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => { loadPatients(); }, [search]);

  const loadPatients = async () => {
    try { const { data } = await getPatients({ search }); setPatients(data.data || data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => { if (confirm('Archiver ce patient ?')) { await deletePatient(id); loadPatients(); }};

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Patients</span></nav>
      <div className="page-header">
        <h1 className="page-title">Patients</h1>
        <button className="btn-primary" onClick={() => navigate('/app/patients/nouveau')}><i className="bi bi-plus"></i> Nouveau patient</button>
      </div>

      <div className="table-toolbar">
        <div className="search-input"><i className="bi bi-search"></i><input type="text" placeholder="Rechercher par nom, téléphone, ID..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>

      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        <table className="data-table">
          <thead><tr><th>ID</th><th>Nom</th><th>Prénom</th><th>Sexe</th><th>Téléphone</th><th>Ville</th><th>Actions</th></tr></thead>
          <tbody>
            {patients.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/patients/${p.id}`)}>
                <td>#{p.id}</td>
                <td>{p.nom}</td>
                <td>{p.prenom}</td>
                <td>{(p as any).sexe === 'M' ? <span className="tag tag-blue">M</span> : (p as any).sexe === 'F' ? <span className="tag tag-purple">F</span> : '-'}</td>
                <td>{p.telephone || '-'}</td>
                <td>{(p as any).ville || '-'}</td>
                <td onClick={e => e.stopPropagation()}>
                  <button className="btn-icon" onClick={() => navigate(`/app/patients/${p.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                  <button className="btn-icon" onClick={() => handleDelete(p.id)}><i className="bi bi-archive"></i></button>
                </td>
              </tr>
            ))}
            {patients.length === 0 && <tr><td colSpan={7} className="table-empty"><i className="bi bi-people" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Aucun patient</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
