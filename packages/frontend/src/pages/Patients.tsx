import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPatients, deletePatient, advancedSearchPatients, getMedecins } from '../services/api';
import { useConfirm } from '../components/ConfirmDialog';
import { useBranding } from '../components/BrandingProvider';
import { formatPhone } from '../components/format';
import type { Patient, Medecin } from '../types';

const emptyAdvFilters = { prenom: '', telephone: '', ville: '', sexe: '', age_min: '', age_max: '', medecin_id: '', reference: '', contact_urgence: '' };

export default function Patients() {
  const { branding } = useBranding();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advFilters, setAdvFilters] = useState(emptyAdvFilters);
  const [advActive, setAdvActive] = useState(false);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const navigate = useNavigate();
  const { confirm } = useConfirm();

  useEffect(() => { if (!advActive) loadPatients(); }, [search, advActive]);

  const loadPatients = async () => {
    try { const { data } = await getPatients({ search }); setPatients(data.data || data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const toggleAdvanced = () => {
    const next = !showAdvanced;
    setShowAdvanced(next);
    if (next && medecins.length === 0) getMedecins().then(r => setMedecins(r.data)).catch(() => {});
  };

  const runAdvancedSearch = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { nom: search };
      Object.entries(advFilters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await advancedSearchPatients(params);
      setPatients(data.data);
      setAdvActive(true);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const resetAdvanced = () => {
    setAdvFilters(emptyAdvFilters);
    setAdvActive(false);
    setShowAdvanced(false);
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({ title: 'Archiver le patient', message: 'Ce patient sera archivé et ne sera plus visible dans la liste active. Cette action est réversible.', confirmLabel: 'Archiver', variant: 'warning' });
    if (ok) { await deletePatient(id); loadPatients(); }
  };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Patients</span></nav>
      <div className="page-header">
        <h1 className="page-title">Patients</h1>
        <button className="btn-primary" onClick={() => navigate('/app/patients/nouveau')}><i className="bi bi-plus"></i> Nouveau patient</button>
      </div>

      <div className="table-toolbar">
        <div className="search-input"><i className="bi bi-search"></i><input type="text" placeholder="Rechercher par nom, téléphone, ID..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button className={`btn-secondary btn-sm ${showAdvanced ? 'active' : ''}`} onClick={toggleAdvanced}>
          <i className="bi bi-funnel"></i> Recherche avancée
        </button>
        {advActive && <button className="btn-ghost btn-sm" onClick={resetAdvanced}><i className="bi bi-x-lg"></i> Réinitialiser</button>}
      </div>

      {showAdvanced && (
        <div className="tile mb-2" style={{ padding: '1.25rem' }}>
          <div className="grid-4">
            <div className="form-group"><label className="form-label">Prénom</label><input type="text" className="form-input" value={advFilters.prenom} onChange={e => setAdvFilters({ ...advFilters, prenom: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Téléphone</label><input type="text" className="form-input" value={advFilters.telephone} onChange={e => setAdvFilters({ ...advFilters, telephone: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Ville</label><input type="text" className="form-input" value={advFilters.ville} onChange={e => setAdvFilters({ ...advFilters, ville: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Sexe</label><select className="form-select" value={advFilters.sexe} onChange={e => setAdvFilters({ ...advFilters, sexe: e.target.value })}><option value="">Tous</option><option value="M">Masculin</option><option value="F">Féminin</option></select></div>
          </div>
          <div className="grid-4">
            <div className="form-group"><label className="form-label">Âge min</label><input type="number" className="form-input" value={advFilters.age_min} onChange={e => setAdvFilters({ ...advFilters, age_min: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Âge max</label><input type="number" className="form-input" value={advFilters.age_max} onChange={e => setAdvFilters({ ...advFilters, age_max: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Médecin</label><select className="form-select" value={advFilters.medecin_id} onChange={e => setAdvFilters({ ...advFilters, medecin_id: e.target.value })}><option value="">Tous</option>{medecins.map(m => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>)}</select></div>
            <div className="form-group"><label className="form-label">N° référence</label><input type="text" className="form-input" value={advFilters.reference} onChange={e => setAdvFilters({ ...advFilters, reference: e.target.value })} /></div>
          </div>
          <div className="grid-4">
            <div className="form-group"><label className="form-label">Contact d'urgence</label><input type="text" className="form-input" value={advFilters.contact_urgence} onChange={e => setAdvFilters({ ...advFilters, contact_urgence: e.target.value })} /></div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn-primary" onClick={runAdvancedSearch} style={{ width: '100%' }}><i className="bi bi-search"></i> Rechercher</button></div>
          </div>
        </div>
      )}

      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        <table className="data-table">
          <thead><tr><th>ID</th><th>Nom</th><th>Prénom</th><th>Sexe</th><th>Téléphone</th><th>Ville</th><th>Actions</th></tr></thead>
          <tbody>
            {patients.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/patients/${p.id}`)}>
                <td>#{(p as any).referenceId || (p as any).reference_id || p.id}</td>
                <td>{p.nom}</td>
                <td>{p.prenom}</td>
                <td>{(p as any).sexe === 'M' ? <span className="tag tag-blue">M</span> : (p as any).sexe === 'F' ? <span className="tag tag-purple">F</span> : '-'}</td>
                <td>{p.telephone ? formatPhone(p.telephone, branding.code_pays) : '-'}</td>
                <td>{(p as any).ville || '-'}</td>
                <td onClick={e => e.stopPropagation()}>
                  <button className="btn-icon" onClick={() => navigate(`/app/patients/${p.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                  <button className="btn-icon" onClick={() => handleDelete(p.id)}><i className="bi bi-archive"></i></button>
                </td>
              </tr>
            ))}
            {patients.length === 0 && <tr><td colSpan={7} className="table-empty"><i className="bi bi-people" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Aucun patient</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
