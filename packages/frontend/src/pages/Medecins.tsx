import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMedecins, deleteMedecin } from '../services/api';
import type { Medecin } from '../types';

export default function Medecins() {
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadMedecins(); }, []);

  const loadMedecins = async () => {
    try { const { data } = await getMedecins(); setMedecins(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => { if (confirm('Supprimer ce médecin ?')) { await deleteMedecin(id); loadMedecins(); }};

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Médecins</span></nav>
      <div className="page-header">
        <h1 className="page-title">Médecins</h1>
        <button className="btn-primary" onClick={() => navigate('/app/medecins/nouveau')}><i className="bi bi-plus"></i> Nouveau médecin</button>
      </div>

      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        <table className="data-table">
          <thead><tr><th>Nom</th><th>Prénom</th><th>Spécialité</th><th>Téléphone</th><th>Actions</th></tr></thead>
          <tbody>
            {medecins.map(m => (
              <tr key={m.id}>
                <td className="fw-600">{m.nom}</td>
                <td>{m.prenom}</td>
                <td><span className="tag tag-blue">{m.specialite || '-'}</span></td>
                <td>{m.telephone || '-'}</td>
                <td>
                  <button className="btn-icon" onClick={() => navigate(`/app/medecins/${m.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                  <button className="btn-icon" onClick={() => handleDelete(m.id)}><i className="bi bi-trash"></i></button>
                </td>
              </tr>
            ))}
            {medecins.length === 0 && <tr><td colSpan={5} className="table-empty">Aucun médecin</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
