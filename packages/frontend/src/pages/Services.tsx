import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getServices, deleteService } from '../services/api';
import { useConfirm } from '../components/ConfirmDialog';
import { useSnackbar } from '../components/Snackbar';
import type { Service } from '../types';

export default function Services() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { showSnackbar } = useSnackbar();

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    try { const { data } = await getServices(); setServices(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({ title: 'Supprimer le service', message: 'Les sous-services seront détachés. Les consultations associées seront conservées.', confirmLabel: 'Supprimer', variant: 'danger' });
    if (ok) { await deleteService(id); showSnackbar('Service supprimé', 'success'); loadServices(); }
  };

  const fmt = (n: number) => n ? new Intl.NumberFormat('fr-FR').format(n) + ' XAF' : '-';

  // Group: parents (no parent_id) and their children
  const parents = services.filter(s => !s.parent_id);
  const childrenOf = (parentId: number) => services.filter(s => s.parent_id === parentId);

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Services</span></nav>
      <div className="page-header">
        <h1 className="page-title">Services</h1>
        <button className="btn-primary" onClick={() => navigate('/app/services/nouveau')}><i className="bi bi-plus"></i> Nouveau service</button>
      </div>

      <div className="notification notification-info mb-2">
        <i className="bi bi-info-circle"></i>
        <span>Les services peuvent avoir des sous-services avec prix et poids. Gérez-les aussi depuis <a href="/app/configuration" style={{ color: 'var(--cds-interactive)' }}>Configuration → Listes de référence</a>.</span>
      </div>

      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        <div>
          {parents.map(service => (
            <div key={service.id} className="tile mb-2" style={{ padding: '1.25rem' }}>
              <div className="d-flex justify-between align-center">
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {service.nom}
                    {!service.actif && <span className="tag tag-red" style={{ fontSize: '0.625rem' }}>Inactif</span>}
                    {service.code && <span className="tag tag-gray" style={{ fontSize: '0.625rem' }}>{service.code}</span>}
                  </h3>
                  <p className="text-muted" style={{ fontSize: '0.8125rem' }}>{service.description || 'Aucune description'}</p>
                </div>
                <div className="d-flex align-center gap-2">
                  {service.prix > 0 && <span className="fw-600" style={{ color: 'var(--cds-support-success)' }}>{fmt(Number(service.prix))}</span>}
                  {service.poids > 0 && <span className="tag tag-blue">Poids: {service.poids}</span>}
                  <button className="btn-ghost btn-sm" onClick={() => navigate(`/app/services/${service.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                  <button className="btn-ghost btn-sm" onClick={() => handleDelete(service.id)}><i className="bi bi-trash"></i></button>
                </div>
              </div>

              {/* Sous-services */}
              {childrenOf(service.id).length > 0 && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--cds-ui-03)' }}>
                  <table className="data-table" style={{ fontSize: '0.8125rem' }}>
                    <thead><tr><th>Sous-service</th><th>Code</th><th>Prix</th><th>Poids</th><th>Statut</th><th></th></tr></thead>
                    <tbody>
                      {childrenOf(service.id).map(sub => (
                        <tr key={sub.id} style={{ opacity: sub.actif ? 1 : 0.5 }}>
                          <td className="fw-600">{sub.nom}</td>
                          <td className="text-muted">{sub.code || '-'}</td>
                          <td className="text-success">{fmt(Number(sub.prix))}</td>
                          <td>{sub.poids || 0}</td>
                          <td>{sub.actif ? <span className="tag tag-green">Actif</span> : <span className="tag tag-red">Inactif</span>}</td>
                          <td>
                            <button className="btn-icon" onClick={() => navigate(`/app/services/${sub.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                            <button className="btn-icon" onClick={() => handleDelete(sub.id)}><i className="bi bi-trash"></i></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {parents.length === 0 && <div className="table-empty">Aucun service configuré</div>}
        </div>
      )}
    </div>
  );
}
