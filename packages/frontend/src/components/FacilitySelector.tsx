import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import { getFacilitiesAll } from '../services/api';

interface FacilityItem {
  id: number;
  nom: string;
  typeFacility?: string | null;
  parentId?: number | null;
}

/**
 * Facility selector for super_admin.
 * Shows a dropdown in the sidebar footer that lets the super_admin switch
 * the active facility context. The selected facilityId is stored in
 * localStorage and sent as X-Facility-Id header on subsequent requests.
 */
export default function FacilitySelector() {
  const { user } = useContext(AuthContext);
  const [facilities, setFacilities] = useState<FacilityItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>(() => localStorage.getItem('facility_id') || '');

  useEffect(() => {
    if (user?.role !== 'super_admin') return;
    getFacilitiesAll().then(({ data }) => setFacilities(data)).catch(() => {});
  }, [user?.role]);

  if (user?.role !== 'super_admin' || facilities.length === 0) return null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedId(val);
    if (val) {
      localStorage.setItem('facility_id', val);
    } else {
      localStorage.removeItem('facility_id');
    }
    // Reload to apply the new facility scope across all pages
    window.location.reload();
  };

  return (
    <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--cds-ui-03)' }}>
      <div style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <i className="bi bi-building" style={{ marginRight: '0.25rem' }}></i>Établissement actif
      </div>
      <select
        className="form-select"
        value={selectedId}
        onChange={handleChange}
        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
      >
        <option value="">Tous les établissements</option>
        {facilities.map(f => (
          <option key={f.id} value={f.id}>{f.nom}{f.parentId ? ' (branche)' : ''}</option>
        ))}
      </select>
    </div>
  );
}
