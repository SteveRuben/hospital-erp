import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchMedecins, getMedecinSpecialites, deleteMedecin } from '../services/api';
import { useConfirm } from '../components/ConfirmDialog';
import { useBranding } from '../components/BrandingProvider';
import { formatPhone } from '../components/format';
import type { Medecin } from '../types';

/**
 * Medecins page with multi-criteria search.
 *   - Single "search" box ORs across nom / prenom / specialite (most common case)
 *   - Specialite dropdown for the focused filter
 *   - Telephone field for finding a doctor when only the phone number is known
 *   - Pagination kicks in via the `searchMedecins` envelope
 *   - Debounced 250ms so each keystroke doesn't hammer the API
 */
export default function Medecins() {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { branding } = useBranding();
  const [filters, setFilters] = useState({ search: '', specialite: '', telephone: '' });
  const [specialites, setSpecialites] = useState<string[]>([]);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const LIMIT = 25;

  useEffect(() => {
    getMedecinSpecialites().then(({ data }) => setSpecialites(data)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await searchMedecins({ ...filters, page, limit: LIMIT });
      setMedecins(data.data);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  // Debounce the search so typing doesn't fire on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Reset to page 1 when filters change so the user doesn't end up on an
  // empty page 4 after narrowing the criteria.
  useEffect(() => { setPage(1); }, [filters.search, filters.specialite, filters.telephone]);

  const handleDelete = async (id: number) => {
    const ok = await confirm({ title: 'Supprimer le médecin', message: 'Ce médecin sera supprimé du système. Les consultations associées seront conservées.', confirmLabel: 'Supprimer', variant: 'danger' });
    if (ok) { await deleteMedecin(id); load(); }
  };

  const clearFilters = () => setFilters({ search: '', specialite: '', telephone: '' });
  const hasFilters = filters.search || filters.specialite || filters.telephone;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Médecins</span></nav>
      <div className="page-header">
        <h1 className="page-title">Médecins</h1>
        <button className="btn-primary" onClick={() => navigate('/app/medecins/nouveau')}><i className="bi bi-plus"></i> Nouveau médecin</button>
      </div>

      <div className="tile mb-2" style={{ padding: '1rem 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Recherche libre</label>
            <input type="text" className="form-input" placeholder="Nom, prénom ou spécialité" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Spécialité</label>
            <select className="form-select" value={filters.specialite} onChange={e => setFilters({ ...filters, specialite: e.target.value })}>
              <option value="">— Toutes —</option>
              {specialites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Téléphone</label>
            <input type="text" className="form-input" placeholder="Partie du numéro" value={filters.telephone} onChange={e => setFilters({ ...filters, telephone: e.target.value })} />
          </div>
          {hasFilters && (
            <button className="btn-ghost btn-sm" onClick={clearFilters} style={{ height: 'fit-content' }}>
              <i className="bi bi-x-circle"></i> Effacer
            </button>
          )}
        </div>
        <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
          {loading ? 'Chargement…' : `${total} médecin${total > 1 ? 's' : ''}${hasFilters ? ' correspondant aux critères' : ''}`}
        </div>
      </div>

      {loading && medecins.length === 0 ? <div className="loading"><div className="spinner"></div></div> : (
        <>
          <table className="data-table">
            <thead><tr><th>Nom</th><th>Prénom</th><th>Spécialité</th><th>Téléphone</th><th>Actions</th></tr></thead>
            <tbody>
              {medecins.map(m => (
                <tr key={m.id}>
                  <td className="fw-600">{m.nom}</td>
                  <td>{m.prenom}</td>
                  <td>{m.specialite ? <span className="tag tag-blue">{m.specialite}</span> : '-'}</td>
                  <td>{m.telephone ? formatPhone(m.telephone, branding.code_pays) : '-'}</td>
                  <td>
                    <button className="btn-icon" onClick={() => navigate(`/app/medecins/${m.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                    <button className="btn-icon" onClick={() => handleDelete(m.id)}><i className="bi bi-trash"></i></button>
                  </td>
                </tr>
              ))}
              {medecins.length === 0 && <tr><td colSpan={5} className="table-empty">{hasFilters ? 'Aucun médecin trouvé' : 'Aucun médecin'}</td></tr>}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="d-flex justify-between align-center mt-2" style={{ fontSize: '0.8125rem' }}>
              <span className="text-muted">Page {page} / {totalPages}</span>
              <div className="d-flex gap-1">
                <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Précédent</button>
                <button className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Suivant →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
