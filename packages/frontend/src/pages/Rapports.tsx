import { useState, useEffect } from 'react';
import api from '../services/api';

export default function Rapports() {
  const [tab, setTab] = useState<'finance' | 'activite' | 'labo'>('finance');
  const [recettesMens, setRecettesMens] = useState<any[]>([]);
  const [depensesMens, setDepensesMens] = useState<any[]>([]);
  const [recettesService, setRecettesService] = useState<any[]>([]);
  const [consMedecin, setConsMedecin] = useState<any[]>([]);
  const [topDiag, setTopDiag] = useState<any[]>([]);
  const [activiteLabo, setActiviteLabo] = useState<any[]>([]);
  const [modesPaiement, setModesPaiement] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [rm, dm, rs, cm, td, al, mp] = await Promise.all([
        api.get('/reports/recettes-mensuelles'), api.get('/reports/depenses-mensuelles'),
        api.get('/reports/recettes-service'), api.get('/reports/consultations-medecin'),
        api.get('/reports/top-diagnostics'), api.get('/reports/activite-labo'),
        api.get('/reports/modes-paiement'),
      ]);
      setRecettesMens(rm.data); setDepensesMens(dm.data); setRecettesService(rs.data);
      setConsMedecin(cm.data); setTopDiag(td.data); setActiviteLabo(al.data); setModesPaiement(mp.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
  const maxVal = (arr: any[], key: string) => Math.max(...arr.map(a => parseFloat(a[key]) || 0), 1);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Rapports</span></nav>
      <div className="page-header"><h1 className="page-title">Rapports & Statistiques</h1></div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'finance' ? 'active' : ''}`} onClick={() => setTab('finance')}>Finances</button>
        <button className={`tab-item ${tab === 'activite' ? 'active' : ''}`} onClick={() => setTab('activite')}>Activité</button>
        <button className={`tab-item ${tab === 'labo' ? 'active' : ''}`} onClick={() => setTab('labo')}>Laboratoire</button>
      </div>

      {tab === 'finance' && (
        <div>
          {/* Recettes mensuelles - bar chart */}
          <div className="tile mb-2" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Recettes mensuelles (12 derniers mois)</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '200px' }}>
              {recettesMens.map((r: any, i: number) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '100%', background: 'var(--cds-support-success)', height: `${(parseFloat(r.total) / maxVal(recettesMens, 'total')) * 180}px`, minHeight: '2px', borderRadius: '2px 2px 0 0' }} title={`${fmt(parseFloat(r.total))} XOF`}></div>
                  <span style={{ fontSize: '0.5rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>{r.mois?.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recettes par service */}
          <div className="grid-2">
            <div className="tile" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Recettes par service</h3>
              {recettesService.map((r: any, i: number) => (
                <div key={i} style={{ marginBottom: '0.75rem' }}>
                  <div className="d-flex justify-between" style={{ fontSize: '0.8125rem' }}><span>{r.nom}</span><span className="fw-600">{fmt(parseFloat(r.total))} XOF</span></div>
                  <div style={{ height: '6px', background: 'var(--cds-ui-03)', borderRadius: '3px', marginTop: '0.25rem' }}><div style={{ height: '100%', background: 'var(--cds-interactive)', borderRadius: '3px', width: `${(parseFloat(r.total) / maxVal(recettesService, 'total')) * 100}%` }}></div></div>
                </div>
              ))}
            </div>
            <div className="tile" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Modes de paiement</h3>
              {modesPaiement.map((m: any, i: number) => (
                <div key={i} style={{ marginBottom: '0.75rem' }}>
                  <div className="d-flex justify-between" style={{ fontSize: '0.8125rem' }}><span>{m.mode_paiement}</span><span>{m.nb} transactions — {fmt(parseFloat(m.total))} XOF</span></div>
                  <div style={{ height: '6px', background: 'var(--cds-ui-03)', borderRadius: '3px', marginTop: '0.25rem' }}><div style={{ height: '100%', background: 'var(--cds-support-success)', borderRadius: '3px', width: `${(parseFloat(m.total) / maxVal(modesPaiement, 'total')) * 100}%` }}></div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'activite' && (
        <div className="grid-2">
          <div className="tile" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Consultations par médecin</h3>
            {consMedecin.map((c: any, i: number) => (
              <div key={i} style={{ marginBottom: '0.75rem' }}>
                <div className="d-flex justify-between" style={{ fontSize: '0.8125rem' }}><span>Dr. {c.prenom} {c.nom} <span className="text-muted">({c.specialite || '-'})</span></span><span className="fw-600">{c.total}</span></div>
                <div style={{ height: '6px', background: 'var(--cds-ui-03)', borderRadius: '3px', marginTop: '0.25rem' }}><div style={{ height: '100%', background: 'var(--cds-interactive)', borderRadius: '3px', width: `${(parseInt(c.total) / maxVal(consMedecin, 'total')) * 100}%` }}></div></div>
              </div>
            ))}
          </div>
          <div className="tile" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Top 10 diagnostics</h3>
            {topDiag.map((d: any, i: number) => (
              <div key={i} className="d-flex justify-between align-center" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--cds-ui-03)', fontSize: '0.8125rem' }}>
                <span>{d.diagnostic?.substring(0, 40)}{d.diagnostic?.length > 40 ? '...' : ''}</span>
                <span className="tag tag-blue">{d.total}</span>
              </div>
            ))}
            {topDiag.length === 0 && <p className="text-muted">Aucune donnée</p>}
          </div>
        </div>
      )}

      {tab === 'labo' && (
        <div className="tile" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Activité laboratoire par type d'examen</h3>
          <table className="data-table">
            <thead><tr><th>Type d'examen</th><th>Nombre</th><th>Revenus</th><th>Part</th></tr></thead>
            <tbody>
              {activiteLabo.map((a: any, i: number) => (
                <tr key={i}><td>{a.type_examen}</td><td className="fw-600">{a.total}</td><td>{fmt(parseFloat(a.revenus))} XOF</td>
                  <td><div style={{ height: '6px', width: '100px', background: 'var(--cds-ui-03)', borderRadius: '3px' }}><div style={{ height: '100%', background: 'var(--cds-support-info)', borderRadius: '3px', width: `${(parseInt(a.total) / maxVal(activiteLabo, 'total')) * 100}%` }}></div></div></td>
                </tr>
              ))}
              {activiteLabo.length === 0 && <tr><td colSpan={4} className="table-empty">Aucune donnée</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}