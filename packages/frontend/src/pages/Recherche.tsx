import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { advancedSearchPatients, getMedecins } from '../services/api';
import type { Medecin } from '../types';

export default function Recherche() {
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [filters, setFilters] = useState({ nom: searchParams.get('q') || '', prenom: '', telephone: '', ville: '', sexe: '', age_min: '', age_max: '', medecin_id: '', reference: '', contact_urgence: '' });
  const navigate = useNavigate();

  useEffect(() => { getMedecins().then(r => setMedecins(r.data)).catch(() => {}); }, []);
  useEffect(() => { if (filters.nom) search(); }, []);

  const search = async (pg = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pg, limit: 20 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await advancedSearchPatients(params);
      setResults(data.data); setTotal(data.total); setPage(data.page); setTotalPages(data.totalPages);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Recherche avancée</span></nav>
      <div className="page-header"><h1 className="page-title">Recherche avancée</h1></div>

      <div className="tile mb-2" style={{ padding: '1.25rem' }}>
        <div className="grid-4">
          <div className="form-group"><label className="form-label">Nom</label><input type="text" className="form-input" value={filters.nom} onChange={e => setFilters({...filters, nom: e.target.value})} /></div>
          <div className="form-group"><label className="form-label">Prénom</label><input type="text" className="form-input" value={filters.prenom} onChange={e => setFilters({...filters, prenom: e.target.value})} /></div>
          <div className="form-group"><label className="form-label">Téléphone</label><input type="text" className="form-input" value={filters.telephone} onChange={e => setFilters({...filters, telephone: e.target.value})} /></div>
          <div className="form-group"><label className="form-label">Ville</label><input type="text" className="form-input" value={filters.ville} onChange={e => setFilters({...filters, ville: e.target.value})} /></div>
        </div>
        <div className="grid-4">
          <div className="form-group"><label className="form-label">Sexe</label><select className="form-select" value={filters.sexe} onChange={e => setFilters({...filters, sexe: e.target.value})}><option value="">Tous</option><option value="M">Masculin</option><option value="F">Féminin</option></select></div>
          <div className="form-group"><label className="form-label">Âge min</label><input type="number" className="form-input" value={filters.age_min} onChange={e => setFilters({...filters, age_min: e.target.value})} /></div>
          <div className="form-group"><label className="form-label">Âge max</label><input type="number" className="form-input" value={filters.age_max} onChange={e => setFilters({...filters, age_max: e.target.value})} /></div>
          <div className="form-group"><label className="form-label">Médecin</label><select className="form-select" value={filters.medecin_id} onChange={e => setFilters({...filters, medecin_id: e.target.value})}><option value="">Tous</option>{medecins.map(m => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>)}</select></div>
        </div>
        <div className="grid-4">
          <div className="form-group"><label className="form-label">N° billet (référence)</label><input type="text" className="form-input" value={filters.reference} onChange={e => setFilters({...filters, reference: e.target.value})} placeholder="ex: CONS-0001" /></div>
          <div className="form-group"><label className="form-label">Contact d'urgence</label><input type="text" className="form-input" value={filters.contact_urgence} onChange={e => setFilters({...filters, contact_urgence: e.target.value})} /></div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn-primary" onClick={() => search(1)} style={{ width: '100%' }}><i className="bi bi-search"></i> Rechercher</button></div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn-ghost" onClick={() => setFilters({ nom: '', prenom: '', telephone: '', ville: '', sexe: '', age_min: '', age_max: '', medecin_id: '', reference: '', contact_urgence: '' })} style={{ width: '100%' }}>Réinitialiser</button></div>
        </div>
      </div>

      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        <>
          {total > 0 && <p className="text-muted mb-1" style={{ fontSize: '0.8125rem' }}>{total} résultat(s) — Page {page}/{totalPages}</p>}
          <table className="data-table">
            <thead><tr><th>ID</th><th>Nom</th><th>Prénom</th><th>Sexe</th><th>Téléphone</th><th>Ville</th><th>Âge</th></tr></thead>
            <tbody>
              {results.map((p: any) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/patients/${p.id}`)}>
                  <td>#{p.id}</td><td className="fw-600">{p.nom}</td><td>{p.prenom}</td>
                  <td>{p.sexe === 'M' ? <span className="tag tag-blue">M</span> : p.sexe === 'F' ? <span className="tag tag-purple">F</span> : '-'}</td>
                  <td>{p.telephone || '-'}</td><td>{p.ville || '-'}</td>
                  <td>{p.date_naissance ? Math.floor((Date.now() - new Date(p.date_naissance).getTime()) / 31557600000) : p.age_estime || '-'}</td>
                </tr>
              ))}
              {results.length === 0 && <tr><td colSpan={7} className="table-empty">Aucun résultat</td></tr>}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="d-flex justify-between align-center mt-2">
              <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => search(page - 1)}>← Précédent</button>
              <span className="text-muted" style={{ fontSize: '0.8125rem' }}>Page {page} / {totalPages}</span>
              <button className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => search(page + 1)}>Suivant →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}