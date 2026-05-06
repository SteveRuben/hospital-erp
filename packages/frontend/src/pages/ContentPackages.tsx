import { useState, useEffect } from 'react';
import api from '../services/api';

export default function ContentPackages() {
  const [packages, setPackages] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState('');

  useEffect(() => { loadPackages(); }, []);

  const loadPackages = async () => {
    try { const { data } = await api.get('/content-packages'); setPackages(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const viewDetail = async (id: string) => {
    try { const { data } = await api.get(`/content-packages/${id}`); setDetail(data); }
    catch { alert('Erreur'); }
  };

  const install = async (id: string) => {
    if (!confirm('Installer ce pack ? Les concepts et types seront ajoutés au système.')) return;
    setInstalling(id);
    try {
      const { data } = await api.post(`/content-packages/${id}/install`);
      alert(`${data.message}\n${data.conceptsAdded} concepts ajoutés\n${data.typesAdded} types d'encounter ajoutés`);
    } catch { alert('Erreur'); }
    finally { setInstalling(''); }
  };

  const packIcons: Record<string, string> = { vih: 'bi-virus', maternite: 'bi-heart-pulse', diabete: 'bi-droplet', pediatrie: 'bi-emoji-smile' };
  const packColors: Record<string, string> = { vih: '#da1e28', maternite: '#ee5396', diabete: '#0f62fe', pediatrie: '#198038' };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Content Packages</span></nav>
      <div className="page-header"><h1 className="page-title">Content Packages</h1></div>

      <div className="notification notification-info mb-2"><i className="bi bi-info-circle"></i><span>Les Content Packages sont des packs de configuration pré-faits pour des cas d'usage spécifiques. Ils ajoutent des concepts médicaux et des types d'encounter au système.</span></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {packages.map((pkg: any) => (
          <div key={pkg.id} className="tile" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: `${packColors[pkg.id] || '#0f62fe'}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`bi ${packIcons[pkg.id] || 'bi-box'}`} style={{ fontSize: '1.25rem', color: packColors[pkg.id] || '#0f62fe' }}></i>
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{pkg.nom}</h3>
                <p className="text-muted" style={{ fontSize: '0.75rem' }}>{pkg.nb_concepts} concepts • {pkg.nb_encounter_types} types</p>
              </div>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>{pkg.description}</p>
            <div className="d-flex gap-1">
              <button className="btn-ghost btn-sm" onClick={() => viewDetail(pkg.id)}><i className="bi bi-eye"></i> Détails</button>
              <button className="btn-primary btn-sm" onClick={() => install(pkg.id)} disabled={installing === pkg.id}>
                {installing === pkg.id ? 'Installation...' : <><i className="bi bi-download"></i> Installer</>}
              </button>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}><div className="modal-container modal-lg" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>{detail.nom}</h3><button className="btn-icon" onClick={() => setDetail(null)}><i className="bi bi-x-lg"></i></button></div>
          <div className="modal-body">
            <p className="text-muted mb-2">{detail.description}</p>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Concepts ({detail.concepts?.length})</h4>
            <table className="data-table mb-2"><thead><tr><th>Code</th><th>Nom</th><th>Type</th><th>Classe</th><th>Unité</th></tr></thead>
              <tbody>{detail.concepts?.map((c: any, i: number) => <tr key={i}><td className="fw-600">{c.code}</td><td>{c.nom}</td><td>{c.datatype}</td><td><span className="tag tag-blue">{c.classe}</span></td><td>{c.unite || '-'}</td></tr>)}</tbody>
            </table>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Types d'encounter ({detail.encounter_types?.length})</h4>
            <div className="d-flex gap-1" style={{ flexWrap: 'wrap' }}>{detail.encounter_types?.map((et: string, i: number) => <span key={i} className="tag tag-gray">{et}</span>)}</div>
          </div>
        </div></div>
      )}
    </div>
  );
}