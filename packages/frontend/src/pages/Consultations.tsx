import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConsultations, deleteConsultation } from '../services/api';
import type { Consultation } from '../types';

export default function Consultations() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try { const { data } = await getConsultations(); setConsultations(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => { if (confirm('Supprimer cette consultation ?')) { await deleteConsultation(id); loadData(); }};

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Consultations</span></nav>
      <div className="page-header">
        <h1 className="page-title">Consultations</h1>
        <button className="btn-primary" onClick={() => navigate('/app/consultations/nouvelle')}><i className="bi bi-plus"></i> Nouvelle consultation</button>
      </div>

      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        <table className="data-table">
          <thead><tr><th>Date</th><th>Patient</th><th>Médecin</th><th>Service</th><th>Diagnostic</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {consultations.map((c: any) => (
              <tr key={c.id}>
                <td>{new Date(c.date_consultation).toLocaleDateString('fr-FR')}</td>
                <td>{c.patient_prenom} {c.patient_nom}</td>
                <td>Dr. {c.medecin_prenom} {c.medecin_nom}</td>
                <td>{c.service_nom || '-'}</td>
                <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.diagnostic || '-'}</td>
                <td><span className={`tag ${c.statut === 'terminee' ? 'tag-green' : c.statut === 'annulee' ? 'tag-red' : 'tag-blue'}`}>{c.statut}</span></td>
                <td>
                  <button className="btn-icon" onClick={() => navigate(`/app/consultations/${c.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                  <button className="btn-icon" onClick={() => handleDelete(c.id)}><i className="bi bi-trash"></i></button>
                </td>
              </tr>
            ))}
            {consultations.length === 0 && <tr><td colSpan={7} className="table-empty">Aucune consultation</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
