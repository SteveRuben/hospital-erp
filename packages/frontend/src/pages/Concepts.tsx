import { useState, useEffect } from 'react';
import { getConcepts, createConcept, getConcept } from '../services/api';

const classes = ['diagnostic', 'symptome', 'test', 'medicament', 'procedure', 'finding', 'question', 'reponse', 'misc'];
const datatypes = ['numeric', 'coded', 'text', 'date', 'boolean', 'datetime', 'document'];
const classeLabels: Record<string, { label: string; tag: string }> = { diagnostic: { label: 'Diagnostic', tag: 'tag-red' }, symptome: { label: 'Symptôme', tag: 'tag-orange' }, test: { label: 'Test', tag: 'tag-purple' }, medicament: { label: 'Médicament', tag: 'tag-blue' }, procedure: { label: 'Procédure', tag: 'tag-teal' }, finding: { label: 'Observation', tag: 'tag-green' }, question: { label: 'Question', tag: 'tag-gray' }, reponse: { label: 'Réponse', tag: 'tag-gray' }, misc: { label: 'Divers', tag: 'tag-gray' } };

export default function Concepts() {
  const [concepts, setConcepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [filterClasse, setFilterClasse] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ nom: '', code: '', datatype: 'text', classe: 'finding', description: '', unite: '', valeur_min: '', valeur_max: '' });

  useEffect(() => { loadConcepts(); }, [filterClasse, search]);

  const loadConcepts = async () => {
    try { const { data } = await getConcepts({ classe: filterClasse || undefined, search: search || undefined }); setConcepts(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await createConcept({ ...form, valeur_min: form.valeur_min ? Number(form.valeur_min) : null, valeur_max: form.valeur_max ? Number(form.valeur_max) : null }); setShowModal(false); setForm({ nom: '', code: '', datatype: 'text', classe: 'finding', description: '', unite: '', valeur_min: '', valeur_max: '' }); loadConcepts(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erreur'); }
  };

  const viewDetail = async (id: number) => {
    try { const { data } = await getConcept(id); setShowDetail(data); }
    catch { alert('Erreur'); }
  };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Dictionnaire de concepts</span></nav>
      <div className="page-header"><h1 className="page-title">Dictionnaire de concepts</h1><button className="btn-primary" onClick={() => setShowModal(true)}><i className="bi bi-plus"></i> Nouveau concept</button></div>

      <div className="notification notification-info mb-2"><i className="bi bi-info-circle"></i><span>Le dictionnaire de concepts définit toutes les données médicales du système : questions, réponses, diagnostics, tests, médicaments. Inspiré du modèle OpenMRS.</span></div>

      <div className="table-toolbar">
        <div className="search-input"><i className="bi bi-search"></i><input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="form-select" style={{ width: '200px' }} value={filterClasse} onChange={e => setFilterClasse(e.target.value)}><option value="">Toutes les classes</option>{classes.map(c => <option key={c} value={c}>{classeLabels[c]?.label || c}</option>)}</select>
      </div>

      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        <table className="data-table">
          <thead><tr><th>Code</th><th>Nom</th><th>Classe</th><th>Type</th><th>Unité</th><th>Plage</th></tr></thead>
          <tbody>
            {concepts.map((c: any) => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => viewDetail(c.id)}>
                <td className="fw-600">{c.code || '-'}</td>
                <td>{c.nom}</td>
                <td><span className={`tag ${classeLabels[c.classe]?.tag || 'tag-gray'}`}>{classeLabels[c.classe]?.label || c.classe}</span></td>
                <td>{c.datatype}</td>
                <td>{c.unite || '-'}</td>
                <td>{c.valeur_min != null ? `${c.valeur_min} - ${c.valeur_max}` : '-'}</td>
              </tr>
            ))}
            {concepts.length === 0 && <tr><td colSpan={6} className="table-empty">Aucun concept</td></tr>}
          </tbody>
        </table>
      )}

      {/* Detail modal */}
      {showDetail && (
        <div className="modal-overlay" onClick={() => setShowDetail(null)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>{showDetail.nom}</h3><button className="btn-icon" onClick={() => setShowDetail(null)}><i className="bi bi-x-lg"></i></button></div>
          <div className="modal-body">
            <div className="grid-3 mb-2">
              <div><span className="form-label">Code</span><p className="fw-600">{showDetail.code || '-'}</p></div>
              <div><span className="form-label">Classe</span><p><span className={`tag ${classeLabels[showDetail.classe]?.tag}`}>{classeLabels[showDetail.classe]?.label}</span></p></div>
              <div><span className="form-label">Type de données</span><p>{showDetail.datatype}</p></div>
            </div>
            {showDetail.description && <div className="mb-2"><span className="form-label">Description</span><p>{showDetail.description}</p></div>}
            {showDetail.unite && <div className="grid-3 mb-2"><div><span className="form-label">Unité</span><p>{showDetail.unite}</p></div><div><span className="form-label">Min</span><p>{showDetail.valeur_min ?? '-'}</p></div><div><span className="form-label">Max</span><p>{showDetail.valeur_max ?? '-'}</p></div></div>}
            {showDetail.mappings?.length > 0 && <div className="mb-2"><span className="form-label">Mappings externes</span><table className="data-table"><thead><tr><th>Source</th><th>Code</th></tr></thead><tbody>{showDetail.mappings.map((m: any) => <tr key={m.id}><td>{m.source}</td><td>{m.code_externe}</td></tr>)}</tbody></table></div>}
            {showDetail.reponses?.length > 0 && <div><span className="form-label">Réponses possibles</span><div className="d-flex gap-1" style={{ flexWrap: 'wrap', marginTop: '0.5rem' }}>{showDetail.reponses.map((r: any) => <span key={r.id} className="tag tag-blue">{r.reponse_nom} ({r.reponse_code})</span>)}</div></div>}
          </div>
        </div></div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouveau concept</h3><button className="btn-icon" onClick={() => setShowModal(false)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleCreate}><div className="modal-body">
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Nom *</label><input type="text" className="form-input" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required placeholder="ex: Température" /></div>
              <div className="form-group"><label className="form-label">Code</label><input type="text" className="form-input" value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="ex: TEMP" /></div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Classe *</label><select className="form-select" value={form.classe} onChange={e => setForm({...form, classe: e.target.value})}>{classes.map(c => <option key={c} value={c}>{classeLabels[c]?.label || c}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Type de données *</label><select className="form-select" value={form.datatype} onChange={e => setForm({...form, datatype: e.target.value})}>{datatypes.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
            {form.datatype === 'numeric' && (
              <div className="grid-3">
                <div className="form-group"><label className="form-label">Unité</label><input type="text" className="form-input" value={form.unite} onChange={e => setForm({...form, unite: e.target.value})} placeholder="ex: °C, mmHg, kg" /></div>
                <div className="form-group"><label className="form-label">Valeur min</label><input type="number" className="form-input" value={form.valeur_min} onChange={e => setForm({...form, valeur_min: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Valeur max</label><input type="number" className="form-input" value={form.valeur_max} onChange={e => setForm({...form, valeur_max: e.target.value})} /></div>
              </div>
            )}
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button type="submit" className="btn-primary">Créer</button></div></form>
        </div></div>
      )}
    </div>
  );
}