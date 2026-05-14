import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getServices, deleteService } from '../services/api';
import { useConfirm } from '../components/ConfirmDialog';
import type { Service } from '../types';

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { confirm } = useConfirm();

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    try { const { data } = await getServices(); setServices(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({ title: 'Supprimer le service', message: 'Ce service sera supprimé. Les données associées seront conservées.', confirmLabel: 'Supprimer', variant: 'danger' });
    if (ok) { await deleteService(id); loadServices(); }
  };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Services</span></nav>
      <div className="page-header">
        <h1 className="page-title">Services</h1>
        <button className="btn-primary" onClick={() => navigate('/app/services/nouveau')}><i className="bi bi-plus"></i> Nouveau service</button>
      </div>

      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {services.map(s => (
            <div className="tile" key={s.id} style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{s.nom}</h3>
              <p className="text-muted" style={{ fontSize: '0.8125rem' }}>{s.description || 'Aucune description'}</p>
              <div className="d-flex gap-1 mt-1">
                <button className="btn-ghost btn-sm" onClick={() => navigate(`/app/services/${s.id}/modifier`)}><i className="bi bi-pencil"></i> Modifier</button>
                <button className="btn-ghost btn-sm" onClick={() => handleDelete(s.id)}><i className="bi bi-trash"></i> Supprimer</button>
              </div>
            </div>
          ))}
          {services.length === 0 && <div className="table-empty" style={{ gridColumn: '1/-1' }}>Aucun service</div>}
        </div>
      )}
    </div>
  );
}
