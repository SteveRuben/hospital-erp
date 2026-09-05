import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFacility } from '../services/api';
import type { Facility } from '../types';

const typeOptions = [
  { value: 'hopital', label: 'Hôpital' },
  { value: 'clinique', label: 'Clinique' },
  { value: 'centre_sante', label: 'Centre de santé' },
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'branche', label: 'Branche / Antenne' },
  { value: 'autre', label: 'Autre' },
];

export default function FacilityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) loadFacility(); }, [id]);

  const loadFacility = async () => {
    try {
      const { data } = await getFacility(Number(id));
      setFacility(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!facility) return <div className="table-empty">Établissement non trouvé</div>;

  const typeLabel = typeOptions.find(t => t.value === facility.typeFacility)?.label || facility.typeFacility || '-';
  const counts = facility._count;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/etablissements">Établissements</a><span className="breadcrumb-separator">/</span>
        <span>{facility.nom}</span>
      </nav>

      <div className="page-header">
        <div>
          <h1 className="page-title">{facility.nom}</h1>
          {facility.code && <span className="tag tag-gray" style={{ marginTop: '0.25rem' }}>{facility.code}</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={() => navigate('/app/etablissements')}>
            <i className="bi bi-arrow-left"></i> Retour
          </button>
          <button className="btn-primary" onClick={() => navigate(`/app/etablissements/${id}/modifier`)}>
            <i className="bi bi-pencil"></i> Modifier
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="tile">
          <h4 style={{ marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Informations</h4>
          <div className="grid-2">
            <div><span className="form-label">Type</span><p><span className="tag tag-blue">{typeLabel}</span></p></div>
            <div><span className="form-label">Statut</span><p>{facility.actif !== false ? <span className="tag tag-green">Actif</span> : <span className="tag tag-gray">Inactif</span>}</p></div>
            <div><span className="form-label">Parent</span><p>{facility.parent?.nom || '— Établissement principal —'}</p></div>
            <div><span className="form-label">Créé le</span><p>{facility.created_at ? new Date(facility.created_at).toLocaleDateString('fr-FR') : '-'}</p></div>
          </div>
        </div>

        <div className="tile">
          <h4 style={{ marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Contact</h4>
          <div className="grid-2">
            <div><span className="form-label">Adresse</span><p>{facility.adresse || '-'}</p></div>
            <div><span className="form-label">Ville</span><p>{facility.ville || '-'}</p></div>
            <div><span className="form-label">Téléphone</span><p>{facility.telephone || '-'}</p></div>
            <div><span className="form-label">Email</span><p>{facility.email || '-'}</p></div>
          </div>
        </div>

        {counts && (
          <div className="tile">
            <h4 style={{ marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Statistiques</h4>
            <div className="grid-3">
              <div><span className="form-label">Utilisateurs</span><p className="fw-600">{counts.users}</p></div>
              <div><span className="form-label">Patients</span><p className="fw-600">{counts.patients}</p></div>
              <div><span className="form-label">Services</span><p className="fw-600">{counts.services}</p></div>
            </div>
          </div>
        )}

        {facility.children && facility.children.length > 0 && (
          <div className="tile">
            <h4 style={{ marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Branches ({facility.children.length})</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {facility.children.map(b => (
                <span key={b.id} className="tag tag-gray">{b.nom}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
