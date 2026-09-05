import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFacilities, deleteFacility } from '../services/api';
import type { Facility } from '../types';
import { useSnackbar } from '../components/Snackbar';
import { useConfirm } from '../components/ConfirmDialog';

export default function Facilities() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const { confirm } = useConfirm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const { data } = await getFacilities();
      setFacilities(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number, nom: string) => {
    const ok = await confirm({ message: `Désactiver "${nom}" ?`, variant: 'danger' });
    if (!ok) return;
    try {
      await deleteFacility(id);
      showSnackbar('Établissement désactivé', 'success');
      loadData();
    } catch (err: any) {
      showSnackbar(err?.response?.data?.error || 'Erreur lors de la désactivation', 'error');
    }
  };

  const topLevel = facilities.filter(f => !f.parentId);
  const branches = (parentId: number) => facilities.filter(f => f.parentId === parentId);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Établissements</span></nav>
      <div className="page-header"><h1 className="page-title">Établissements & Branches</h1>
        <button className="btn-primary" onClick={() => navigate('/app/etablissements/nouveau')}><i className="bi bi-plus-lg"></i> Nouvel établissement</button>
      </div>

      <div className="grid-3 mb-3">
        <div className="tile stat-tile"><div className="stat-value">{topLevel.length}</div><div className="stat-label">Établissements</div></div>
        <div className="tile stat-tile"><div className="stat-value">{facilities.filter(f => f.parentId).length}</div><div className="stat-label">Branches</div></div>
        <div className="tile stat-tile"><div className="stat-value">{facilities.length}</div><div className="stat-label">Total</div></div>
      </div>

      {topLevel.map(f => (
        <div key={f.id} className="card mb-2">
          <div className="card-header d-flex justify-content-between">
            <div>
              <span className="fw-600">{f.nom}</span>
              {f.code && <span className="tag tag-gray" style={{marginLeft:'0.5rem'}}>{f.code}</span>}
              <span className="tag tag-blue" style={{marginLeft:'0.5rem'}}>{f.typeFacility || '-'}</span>
              {f.ville && <span className="text-muted" style={{marginLeft:'0.5rem',fontSize:'0.8125rem'}}>{f.ville}</span>}
            </div>
            <div className="d-flex gap-05">
              <button className="btn-sm btn-secondary" onClick={() => navigate(`/app/etablissements/${f.id}`)} title="Voir"><i className="bi bi-eye"></i></button>
              <button className="btn-sm btn-secondary" onClick={() => navigate(`/app/etablissements/${f.id}/modifier`)} title="Modifier"><i className="bi bi-pencil"></i></button>
              <button className="btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(f.id, f.nom); }} title="Désactiver"><i className="bi bi-trash"></i></button>
            </div>
          </div>
          {(branches(f.id).length > 0 || true) && (
            <div className="card-body p-0">
              <table className="table table-hover mb-0">
                <thead><tr><th>Branche / Antenne</th><th>Type</th><th>Ville</th><th>Actions</th></tr></thead>
                <tbody>
                  {branches(f.id).map(b => (
                    <tr key={b.id}>
                      <td className="fw-600" style={{cursor:'pointer',color:'var(--cds-link)'}} onClick={() => navigate(`/app/etablissements/${b.id}`)}>{b.nom}</td>
                      <td><span className="tag tag-gray">{b.typeFacility || '-'}</span></td>
                      <td>{b.ville || '-'}</td>
                      <td><div className="d-flex gap-05">
                        <button className="btn-sm btn-secondary" onClick={() => navigate(`/app/etablissements/${b.id}`)} title="Voir"><i className="bi bi-eye"></i></button>
                        <button className="btn-sm btn-secondary" onClick={() => navigate(`/app/etablissements/${b.id}/modifier`)} title="Modifier"><i className="bi bi-pencil"></i></button>
                        <button className="btn-sm btn-danger" onClick={() => handleDelete(b.id, b.nom)} title="Désactiver"><i className="bi bi-trash"></i></button>
                      </div></td>
                    </tr>
                  ))}
                  {branches(f.id).length === 0 && <tr><td colSpan={4} className="text-muted" style={{fontSize:'0.8125rem',padding:'0.5rem 1rem'}}>Aucune branche</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {facilities.length === 0 && <div className="table-empty"><i className="bi bi-building" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Aucun établissement</div>}

    </div>
  );
}
