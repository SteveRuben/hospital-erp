import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { advancedSearchPatients, getMedecins, createListePatients, addPatientToListe } from '../services/api';
import type { Medecin } from '../types';

interface Criterion { field: string; operator: string; value: string }

const fieldOptions = [
  { value: 'nom', label: 'Nom' },
  { value: 'prenom', label: 'Prénom' },
  { value: 'sexe', label: 'Sexe' },
  { value: 'ville', label: 'Ville' },
  { value: 'age_min', label: 'Âge minimum' },
  { value: 'age_max', label: 'Âge maximum' },
  { value: 'telephone', label: 'Téléphone' },
  { value: 'medecin_id', label: 'Médecin traitant' },
  { value: 'reference', label: 'N° billet' },
];

export default function CohortBuilder() {
  const [criteria, setCriteria] = useState<Criterion[]>([{ field: 'sexe', operator: '=', value: '' }]);
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const navigate = useNavigate();

  useState(() => { getMedecins().then(r => setMedecins(r.data)).catch(() => {}); });

  const addCriterion = () => setCriteria([...criteria, { field: 'nom', operator: '=', value: '' }]);
  const removeCriterion = (i: number) => setCriteria(criteria.filter((_, idx) => idx !== i));
  const updateCriterion = (i: number, updates: Partial<Criterion>) => {
    const c = [...criteria]; c[i] = { ...c[i], ...updates }; setCriteria(c);
  };

  const search = async () => {
    setLoading(true);
    const params: Record<string, string> = { limit: '100' };
    for (const c of criteria) { if (c.value) params[c.field] = c.value; }
    try {
      const { data } = await advancedSearchPatients(params);
      setResults(data.data || []); setTotal(data.total || 0);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  const saveAsListe = async () => {
    if (!saveName || results.length === 0) return;
    try {
      const { data: liste } = await createListePatients({ nom: saveName, description: `Cohorte: ${criteria.map(c => `${c.field}=${c.value}`).join(', ')}` });
      for (const p of results) { await addPatientToListe(liste.id, p.id); }
      alert(`Liste "${saveName}" créée avec ${results.length} patients`);
      setShowSave(false); setSaveName('');
    } catch { alert('Erreur'); }
  };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Cohort Builder</span></nav>
      <div className="page-header"><h1 className="page-title">Constructeur de cohortes</h1></div>

      <div className="notification notification-info mb-2"><i className="bi bi-info-circle"></i><span>Combinez des critères pour identifier un groupe de patients. Sauvegardez le résultat comme liste de patients.</span></div>

      <div className="tile mb-2" style={{ padding: '1.25rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Critères de recherche</h3>
        {criteria.map((c, i) => (
          <div key={i} className="d-flex gap-1 align-center mb-1">
            {i > 0 && <span className="tag tag-blue" style={{ minWidth: '30px', textAlign: 'center' }}>ET</span>}
            <select className="form-select" style={{ width: '180px' }} value={c.field} onChange={e => updateCriterion(i, { field: e.target.value })}>
              {fieldOptions.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            {c.field === 'sexe' ? (
              <select className="form-select" style={{ width: '150px' }} value={c.value} onChange={e => updateCriterion(i, { value: e.target.value })}><option value="">Tous</option><option value="M">Masculin</option><option value="F">Féminin</option></select>
            ) : c.field === 'medecin_id' ? (
              <select className="form-select" style={{ flex: 1 }} value={c.value} onChange={e => updateCriterion(i, { value: e.target.value })}><option value="">Tous</option>{medecins.map(m => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>)}</select>
            ) : (
              <input type={c.field.includes('age') ? 'number' : 'text'} className="form-input" style={{ flex: 1 }} value={c.value} onChange={e => updateCriterion(i, { value: e.target.value })} placeholder="Valeur..." />
            )}
            {criteria.length > 1 && <button className="btn-icon" onClick={() => removeCriterion(i)}><i className="bi bi-x-lg"></i></button>}
          </div>
        ))}
        <div className="d-flex gap-1 mt-2">
          <button className="btn-ghost btn-sm" onClick={addCriterion}><i className="bi bi-plus"></i> Ajouter un critère</button>
          <button className="btn-primary" onClick={search} disabled={loading}>{loading ? 'Recherche...' : 'Rechercher'}</button>
        </div>
      </div>

      {results.length > 0 && (
        <div>
          <div className="d-flex justify-between align-center mb-1">
            <p className="text-muted">{total} patient(s) trouvé(s)</p>
            <button className="btn-primary btn-sm" onClick={() => setShowSave(true)}><i className="bi bi-save"></i> Sauvegarder comme liste</button>
          </div>
          <table className="data-table">
            <thead><tr><th>ID</th><th>Nom</th><th>Prénom</th><th>Sexe</th><th>Ville</th><th>Téléphone</th></tr></thead>
            <tbody>
              {results.map((p: any) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/patients/${p.id}`)}>
                  <td>#{p.id}</td><td className="fw-600">{p.nom}</td><td>{p.prenom}</td>
                  <td>{p.sexe === 'M' ? <span className="tag tag-blue">M</span> : p.sexe === 'F' ? <span className="tag tag-purple">F</span> : '-'}</td>
                  <td>{p.ville || '-'}</td><td>{p.telephone || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showSave && (
        <div className="modal-overlay" onClick={() => setShowSave(false)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Sauvegarder la cohorte</h3><button className="btn-icon" onClick={() => setShowSave(false)}><i className="bi bi-x-lg"></i></button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">Nom de la liste *</label><input type="text" className="form-input" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="ex: Femmes diabétiques > 50 ans" /></div>
            <p className="text-muted" style={{ fontSize: '0.8125rem' }}>{results.length} patients seront ajoutés à cette liste</p>
          </div>
          <div className="modal-footer"><button className="btn-secondary" onClick={() => setShowSave(false)}>Annuler</button><button className="btn-primary" onClick={saveAsListe}>Sauvegarder</button></div>
        </div></div>
      )}
    </div>
  );
}