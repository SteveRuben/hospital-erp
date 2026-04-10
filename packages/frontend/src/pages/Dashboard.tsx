import { useState, useEffect } from 'react';
import { getDashboard } from '../services/api';
import type { DashboardStats } from '../types';

export default function Dashboard() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try { const { data: d } = await getDashboard(); setData(d); } 
    catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const formatCurrency = (num: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(num);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <span className="text-muted">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>
      <div className="row g-3 mb-4">
        <div className="col-md-3"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">{data?.patients.total || 0}</div><div className="stat-label">Total Patients</div></div><div className="stat-icon bg-primary bg-opacity-10 text-primary"><i className="bi bi-people"></i></div></div></div></div>
        <div className="col-md-3"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">+{data?.patients.nouveaux || 0}</div><div className="stat-label">Nouveaux ce mois</div></div><div className="stat-icon bg-success bg-opacity-10 text-success"><i className="bi bi-person-plus"></i></div></div></div></div>
        <div className="col-md-3"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">{data?.consultations.aujourdhui || 0}</div><div className="stat-label">Consultations aujourd'hui</div></div><div className="stat-icon bg-info bg-opacity-10 text-info"><i className="bi bi-clipboard-pulse"></i></div></div></div></div>
        <div className="col-md-3"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">{formatCurrency(data?.caisse.jour.solde || 0)}</div><div className="stat-label">Caisse du jour</div></div><div className="stat-icon bg-warning bg-opacity-10 text-warning"><i className="bi bi-cash"></i></div></div></div></div>
      </div>
      <div className="row g-3">
        <div className="col-md-6"><div className="card"><div className="card-header">Services les plus actifs</div><div className="card-body p-0"><table className="table table-hover mb-0"><tbody>{data?.servicesActifs.map((s, i) => <tr key={i}><td>{s.nom}</td><td className="text-end"><span className="badge bg-primary">{s.nb_consultations}</span></td></tr>)}</tbody></table></div></div></div>
        <div className="col-md-6"><div className="card"><div className="card-header">Médecins les plus consultés</div><div className="card-body p-0"><table className="table table-hover mb-0"><tbody>{data?.medecinsActifs.map((m, i) => <tr key={i}><td><div>Dr. {m.prenom} {m.nom}</div><small className="text-muted">{m.specialite}</small></td><td className="text-end"><span className="badge bg-success">{m.nb_consultations}</span></td></tr>)}</tbody></table></div></div></div>
      </div>
    </div>
  );
}