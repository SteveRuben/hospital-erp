import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboard } from '../services/api';
import type { DashboardStats } from '../types';

const REFRESH_INTERVAL = 30_000;

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function Dashboard() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const navigate = useNavigate();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const { data: d } = await getDashboard(selectedMonth);
      setData(d);
      setLastUpdated(new Date());
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }, [selectedMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    intervalRef.current = setInterval(() => loadData(true), REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadData]);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const formatCurrency = (num: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(num);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <div className="d-flex gap-1" style={{alignItems:'center'}}>
          {lastUpdated && <span className="text-muted" style={{fontSize:'0.75rem'}}>Mis à jour {lastUpdated.toLocaleTimeString('fr-FR')}</span>}
          <button className="btn-secondary btn-sm" onClick={() => loadData(true)} disabled={refreshing} title="Actualiser">
            <i className={`bi ${refreshing ? 'bi-arrow-repeat spin' : 'bi-arrow-clockwise'}`}></i> Actualiser
          </button>
          <span className="text-muted">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>
      <div className="row g-3 mb-4">
        <div className="col-md-3"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">{data?.patients.total || 0}</div><div className="stat-label">Total Patients</div></div><div className="stat-icon bg-primary bg-opacity-10 text-primary"><i className="bi bi-people"></i></div></div></div></div>
        <div className="col-md-3"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">+{data?.patients.nouveaux || 0}</div><div className="stat-label">Nouveaux ce mois</div></div><div className="stat-icon bg-success bg-opacity-10 text-success"><i className="bi bi-person-plus"></i></div></div></div></div>
        <div className="col-md-3"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">{data?.consultations.aujourdhui || 0}</div><div className="stat-label">Consultations aujourd'hui</div></div><div className="stat-icon bg-info bg-opacity-10 text-info"><i className="bi bi-clipboard-pulse"></i></div></div></div></div>
        <div className="col-md-3"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">{formatCurrency(data?.caisse.jour.solde || 0)}</div><div className="stat-label">Caisse du jour</div></div><div className="stat-icon bg-warning bg-opacity-10 text-warning"><i className="bi bi-cash"></i></div></div></div></div>
        <div className="col-md-3"><div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/app/laboratoire')} title="Voir le laboratoire"><div className="d-flex justify-content-between"><div><div className="stat-value">{data?.examens?.en_attente_resultat || 0}</div><div className="stat-label">Examens en attente de résultat</div></div><div className="stat-icon bg-warning bg-opacity-10 text-warning"><i className="bi bi-hourglass-split"></i></div></div></div></div>
      </div>

      {/* Caisse du mois — navigable par mois (défaut : mois en cours) */}
      <div className="card mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span>Caisse du mois</span>
          <div className="d-flex gap-1" style={{ alignItems: 'center' }}>
            <button className="btn-icon" title="Mois précédent" onClick={() => setSelectedMonth(m => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })}>
              <i className="bi bi-chevron-left"></i>
            </button>
            <input
              type="month"
              className="form-input"
              style={{ width: '160px' }}
              value={selectedMonth}
              max={currentMonth()}
              onChange={e => e.target.value && setSelectedMonth(e.target.value)}
            />
            <button className="btn-icon" title="Mois suivant" disabled={selectedMonth >= currentMonth()} onClick={() => setSelectedMonth(m => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })}>
              <i className="bi bi-chevron-right"></i>
            </button>
            {selectedMonth !== currentMonth() && <button className="btn-secondary btn-sm" onClick={() => setSelectedMonth(currentMonth())}>Mois en cours</button>}
          </div>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">{formatCurrency(data?.caisse.mois.recettes || 0)}</div><div className="stat-label">Recettes du mois</div></div><div className="stat-icon bg-success bg-opacity-10 text-success"><i className="bi bi-arrow-down-circle"></i></div></div></div></div>
            <div className="col-md-4"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">{formatCurrency(data?.caisse.mois.depenses || 0)}</div><div className="stat-label">Dépenses du mois</div></div><div className="stat-icon bg-danger bg-opacity-10 text-danger"><i className="bi bi-arrow-up-circle"></i></div></div></div></div>
            <div className="col-md-4"><div className="stat-card"><div className="d-flex justify-content-between"><div><div className="stat-value">{formatCurrency(data?.caisse.mois.solde || 0)}</div><div className="stat-label">Solde du mois</div></div><div className="stat-icon bg-primary bg-opacity-10 text-primary"><i className="bi bi-wallet2"></i></div></div></div></div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-6"><div className="card"><div className="card-header">Services les plus actifs</div><div className="card-body p-0"><table className="table table-hover mb-0"><tbody>{data?.servicesActifs.map((s, i) => <tr key={i}><td>{s.nom}</td><td className="text-end"><span className="badge bg-primary">{s.nb_consultations}</span></td></tr>)}</tbody></table></div></div></div>
        <div className="col-md-6"><div className="card"><div className="card-header">Médecins les plus consultés</div><div className="card-body p-0"><table className="table table-hover mb-0"><tbody>{data?.medecinsActifs.map((m, i) => <tr key={i}><td><div>Dr. {m.prenom} {m.nom}</div><small className="text-muted">{m.specialite}</small></td><td className="text-end"><span className="badge bg-success">{m.nb_consultations}</span></td></tr>)}</tbody></table></div></div></div>
      </div>
    </div>
  );
}
