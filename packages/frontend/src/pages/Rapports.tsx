import { useState, useEffect } from 'react';
import api from '../services/api';
import { useBranding } from '../components/BrandingProvider';
import { formatMoney } from '../components/format';

type Granularity = 'week' | 'month' | 'year';
type LaboGranularity = 'day' | 'week' | 'month' | 'year';
interface PatientServicePeriodRow { period: string; service_id: number; service_nom: string; patients: number }
interface LaboPeriodRow { period: string; type_examen: string; count: number; revenus: number }

export default function Rapports() {
  const { branding } = useBranding();
  const [tab, setTab] = useState<'finance' | 'activite' | 'patients' | 'labo'>('finance');
  const [recettesMens, setRecettesMens] = useState<any[]>([]);
  const [depensesMens, setDepensesMens] = useState<any[]>([]);
  const [recettesService, setRecettesService] = useState<any[]>([]);
  const [consMedecin, setConsMedecin] = useState<any[]>([]);
  const [topDiag, setTopDiag] = useState<any[]>([]);
  const [activiteLabo, setActiviteLabo] = useState<any[]>([]);
  const [modesPaiement, setModesPaiement] = useState<any[]>([]);
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [patientsByService, setPatientsByService] = useState<PatientServicePeriodRow[]>([]);
  const [laboGranularity, setLaboGranularity] = useState<LaboGranularity>('month');
  const [laboParPeriode, setLaboParPeriode] = useState<LaboPeriodRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (tab === 'patients') loadPatientsByService(); }, [tab, granularity]);
  useEffect(() => { if (tab === 'labo') loadLaboParPeriode(); }, [tab, laboGranularity]);

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

  const loadPatientsByService = async () => {
    try {
      const { data } = await api.get<PatientServicePeriodRow[]>('/reports/patients-by-service-period', { params: { granularity } });
      setPatientsByService(data);
    } catch (err) { console.error(err); }
  };

  const loadLaboParPeriode = async () => {
    try {
      const { data } = await api.get<LaboPeriodRow[]>('/reports/labo-par-periode', { params: { granularity: laboGranularity } });
      setLaboParPeriode(data);
    } catch (err) { console.error(err); }
  };

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
  const money = (n: number | string) => formatMoney(typeof n === 'string' ? Number(n) : n, branding.devise);
  const maxVal = (arr: any[], key: string) => Math.max(...arr.map(a => parseFloat(a[key]) || 0), 1);

  // Pivot the patients-by-service rows into a grid: rows = period, cols = service.
  // Periods sorted descending (most recent first) so the table reads top-to-bottom
  // like a journal.
  const pivot = (() => {
    const periods = Array.from(new Set(patientsByService.map(r => r.period))).sort((a, b) => b.localeCompare(a));
    const services = Array.from(new Map(patientsByService.map(r => [r.service_id, r.service_nom])).entries())
      .sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''));
    const grid = new Map<string, number>();
    for (const r of patientsByService) grid.set(`${r.period}|${r.service_id}`, r.patients);
    const totalsByService = new Map<number, number>();
    const totalsByPeriod = new Map<string, number>();
    for (const r of patientsByService) {
      totalsByService.set(r.service_id, (totalsByService.get(r.service_id) ?? 0) + r.patients);
      totalsByPeriod.set(r.period, (totalsByPeriod.get(r.period) ?? 0) + r.patients);
    }
    return { periods, services, grid, totalsByService, totalsByPeriod };
  })();
  const maxCell = Math.max(...patientsByService.map(r => r.patients), 1);

  // Same pivot shape for labo: rows = period, cols = type_examen, cells = count
  const laboPivot = (() => {
    const periods = Array.from(new Set(laboParPeriode.map(r => r.period))).sort((a, b) => b.localeCompare(a));
    const types = Array.from(new Set(laboParPeriode.map(r => r.type_examen))).sort();
    const grid = new Map<string, number>();
    for (const r of laboParPeriode) grid.set(`${r.period}|${r.type_examen}`, r.count);
    const totalsByType = new Map<string, number>();
    const totalsByPeriod = new Map<string, number>();
    for (const r of laboParPeriode) {
      totalsByType.set(r.type_examen, (totalsByType.get(r.type_examen) ?? 0) + r.count);
      totalsByPeriod.set(r.period, (totalsByPeriod.get(r.period) ?? 0) + r.count);
    }
    return { periods, types, grid, totalsByType, totalsByPeriod };
  })();
  const maxLaboCell = Math.max(...laboParPeriode.map(r => r.count), 1);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Rapports</span></nav>
      <div className="page-header"><h1 className="page-title">Rapports & Statistiques</h1></div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'finance' ? 'active' : ''}`} onClick={() => setTab('finance')}>Finances</button>
        <button className={`tab-item ${tab === 'activite' ? 'active' : ''}`} onClick={() => setTab('activite')}>Activité</button>
        <button className={`tab-item ${tab === 'patients' ? 'active' : ''}`} onClick={() => setTab('patients')}>Patients par service</button>
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
                  <div style={{ width: '100%', background: 'var(--cds-support-success)', height: `${(parseFloat(r.total) / maxVal(recettesMens, 'total')) * 180}px`, minHeight: '2px', borderRadius: '2px 2px 0 0' }} title={`${money(r.total)}`}></div>
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
                  <div className="d-flex justify-between" style={{ fontSize: '0.8125rem' }}><span>{r.nom}</span><span className="fw-600">{money(r.total)}</span></div>
                  <div style={{ height: '6px', background: 'var(--cds-ui-03)', borderRadius: '3px', marginTop: '0.25rem' }}><div style={{ height: '100%', background: 'var(--cds-interactive)', borderRadius: '3px', width: `${(parseFloat(r.total) / maxVal(recettesService, 'total')) * 100}%` }}></div></div>
                </div>
              ))}
            </div>
            <div className="tile" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Modes de paiement</h3>
              {modesPaiement.map((m: any, i: number) => (
                <div key={i} style={{ marginBottom: '0.75rem' }}>
                  <div className="d-flex justify-between" style={{ fontSize: '0.8125rem' }}><span>{m.mode_paiement}</span><span>{m.nb} transactions — {money(m.total)}</span></div>
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

      {tab === 'patients' && (
        <div>
          <div className="tile mb-2" style={{ padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Granularité :</span>
            {(['week', 'month', 'year'] as Granularity[]).map(g => (
              <button key={g} className={`btn-sm ${granularity === g ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setGranularity(g)}>
                {g === 'week' ? 'Semaine' : g === 'month' ? 'Mois' : 'Année'}
              </button>
            ))}
            <span className="text-muted" style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>Patients distincts par service sur les 12 derniers {granularity === 'week' ? 'semaines' : granularity === 'month' ? 'mois' : 'années'}</span>
          </div>

          <div className="tile" style={{ padding: '1rem', overflowX: 'auto' }}>
            {pivot.periods.length === 0 ? (
              <div className="table-empty" style={{ padding: '2rem', textAlign: 'center' }}>
                <i className="bi bi-bar-chart" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}></i>
                Aucune consultation sur la période
              </div>
            ) : (
              <table className="data-table" style={{ minWidth: 'max-content' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--cds-ui-02)' }}>Période</th>
                    {pivot.services.map(([id, nom]) => (
                      <th key={id} style={{ textAlign: 'center', minWidth: '100px' }}>{nom}</th>
                    ))}
                    <th style={{ textAlign: 'center', background: 'var(--cds-ui-01)', fontWeight: 700 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.periods.map(p => (
                    <tr key={p}>
                      <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--cds-ui-02)' }}>{p}</td>
                      {pivot.services.map(([id]) => {
                        const v = pivot.grid.get(`${p}|${id}`) ?? 0;
                        // Heatmap intensity proportional to the max cell value
                        const intensity = v === 0 ? 0 : 0.15 + 0.85 * (v / maxCell);
                        return (
                          <td key={id} style={{ textAlign: 'center', background: v === 0 ? 'transparent' : `rgba(15, 98, 254, ${intensity})`, color: intensity > 0.5 ? '#fff' : 'inherit', fontWeight: v > 0 ? 600 : 400 }}>
                            {v === 0 ? '—' : v}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', background: 'var(--cds-ui-01)', fontWeight: 700 }}>{pivot.totalsByPeriod.get(p) ?? 0}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--cds-ui-01)', fontWeight: 700 }}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--cds-ui-01)' }}>Total</td>
                    {pivot.services.map(([id]) => (
                      <td key={id} style={{ textAlign: 'center' }}>{pivot.totalsByService.get(id) ?? 0}</td>
                    ))}
                    <td style={{ textAlign: 'center' }}>{patientsByService.reduce((acc, r) => acc + r.patients, 0)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'labo' && (
        <div>
          {/* Totals by examen type — kept from the original view */}
          <div className="tile mb-2" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Activité laboratoire par type d'examen (cumul)</h3>
            <table className="data-table">
              <thead><tr><th>Type d'examen</th><th>Nombre</th><th>Revenus</th><th>Part</th></tr></thead>
              <tbody>
                {activiteLabo.map((a: any, i: number) => (
                  <tr key={i}><td>{a.type_examen}</td><td className="fw-600">{a.total}</td><td>{money(a.revenus)}</td>
                    <td><div style={{ height: '6px', width: '100px', background: 'var(--cds-ui-03)', borderRadius: '3px' }}><div style={{ height: '100%', background: 'var(--cds-support-info)', borderRadius: '3px', width: `${(parseInt(a.total) / maxVal(activiteLabo, 'total')) * 100}%` }}></div></div></td>
                  </tr>
                ))}
                {activiteLabo.length === 0 && <tr><td colSpan={4} className="table-empty">Aucune donnée</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Examens × période — new */}
          <div className="tile mb-2" style={{ padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Granularité :</span>
            {(['day', 'week', 'month', 'year'] as LaboGranularity[]).map(g => (
              <button key={g} className={`btn-sm ${laboGranularity === g ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setLaboGranularity(g)}>
                {g === 'day' ? 'Jour' : g === 'week' ? 'Semaine' : g === 'month' ? 'Mois' : 'Année'}
              </button>
            ))}
            <span className="text-muted" style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>
              Nombre d'examens par type sur les {laboGranularity === 'day' ? '30 derniers jours' : laboGranularity === 'week' ? '12 dernières semaines' : laboGranularity === 'month' ? '12 derniers mois' : '5 dernières années'}
            </span>
          </div>

          <div className="tile" style={{ padding: '1rem', overflowX: 'auto' }}>
            {laboPivot.periods.length === 0 ? (
              <div className="table-empty" style={{ padding: '2rem', textAlign: 'center' }}>
                <i className="bi bi-flask" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}></i>
                Aucun examen sur la période
              </div>
            ) : (
              <table className="data-table" style={{ minWidth: 'max-content' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--cds-ui-02)' }}>Période</th>
                    {laboPivot.types.map(t => (
                      <th key={t} style={{ textAlign: 'center', minWidth: '110px' }}>{t}</th>
                    ))}
                    <th style={{ textAlign: 'center', background: 'var(--cds-ui-01)', fontWeight: 700 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {laboPivot.periods.map(p => (
                    <tr key={p}>
                      <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--cds-ui-02)' }}>{p}</td>
                      {laboPivot.types.map(t => {
                        const v = laboPivot.grid.get(`${p}|${t}`) ?? 0;
                        const intensity = v === 0 ? 0 : 0.15 + 0.85 * (v / maxLaboCell);
                        return (
                          <td key={t} style={{ textAlign: 'center', background: v === 0 ? 'transparent' : `rgba(17, 146, 232, ${intensity})`, color: intensity > 0.5 ? '#fff' : 'inherit', fontWeight: v > 0 ? 600 : 400 }}>
                            {v === 0 ? '—' : v}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', background: 'var(--cds-ui-01)', fontWeight: 700 }}>{laboPivot.totalsByPeriod.get(p) ?? 0}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--cds-ui-01)', fontWeight: 700 }}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--cds-ui-01)' }}>Total</td>
                    {laboPivot.types.map(t => (
                      <td key={t} style={{ textAlign: 'center' }}>{laboPivot.totalsByType.get(t) ?? 0}</td>
                    ))}
                    <td style={{ textAlign: 'center' }}>{laboParPeriode.reduce((acc, r) => acc + r.count, 0)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}