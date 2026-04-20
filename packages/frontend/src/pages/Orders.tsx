import { useState, useEffect } from 'react';
import { getOrders, createOrder, updateOrderStatut, getPatients, getConcepts } from '../services/api';
import type { Patient } from '../types';

const typeLabels: Record<string, { label: string; tag: string }> = { prescription: { label: 'Prescription', tag: 'tag-blue' }, test_labo: { label: 'Test Labo', tag: 'tag-purple' }, imagerie: { label: 'Imagerie', tag: 'tag-teal' }, procedure: { label: 'Procédure', tag: 'tag-green' }, referral: { label: 'Référence', tag: 'tag-orange' } };
const statutLabels: Record<string, { label: string; tag: string }> = { nouveau: { label: 'Nouveau', tag: 'tag-gray' }, actif: { label: 'Actif', tag: 'tag-blue' }, complete: { label: 'Complété', tag: 'tag-green' }, annule: { label: 'Annulé', tag: 'tag-red' }, expire: { label: 'Expiré', tag: 'tag-yellow' } };
const urgenceLabels: Record<string, { label: string; tag: string }> = { routine: { label: 'Routine', tag: 'tag-gray' }, urgent: { label: 'Urgent', tag: 'tag-orange' }, stat: { label: 'STAT', tag: 'tag-red' } };

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState('actif');
  const [form, setForm] = useState({ patient_id: '', concept_id: '', type_order: 'prescription', urgence: 'routine', instructions: '', dosage: '', frequence: '', duree: '', voie: '' });

  useEffect(() => { loadData(); }, [filterType, filterStatut]);

  const loadData = async () => {
    try {
      const [o, p, c] = await Promise.all([getOrders({ type_order: filterType || undefined, statut: filterStatut || undefined }), getPatients({ archived: 'false' }), getConcepts()]);
      setOrders(o.data.data || o.data); setTotal(o.data.total || 0); setPatients(p.data.data || p.data); setConcepts(c.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await createOrder(form); setShowModal(false); setForm({ patient_id: '', concept_id: '', type_order: 'prescription', urgence: 'routine', instructions: '', dosage: '', frequence: '', duree: '', voie: '' }); loadData(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erreur'); }
  };

  const changeStatut = async (id: number, statut: string) => {
    try { await updateOrderStatut(id, { statut }); loadData(); } catch { alert('Erreur'); }
  };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Ordres médicaux</span></nav>
      <div className="page-header"><h1 className="page-title">Ordres médicaux</h1><button className="btn-primary" onClick={() => setShowModal(true)}><i className="bi bi-plus"></i> Nouvel ordre</button></div>

      <div className="table-toolbar">
        <div className="d-flex gap-2 align-center">
          <select className="form-select" style={{ width: '180px' }} value={filterType} onChange={e => setFilterType(e.target.value)}><option value="">Tous les types</option>{Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select className="form-select" style={{ width: '150px' }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}><option value="">Tous statuts</option><option value="nouveau">Nouveau</option><option value="actif">Actif</option><option value="complete">Complété</option><option value="annule">Annulé</option></select>
          <span className="text-muted" style={{ fontSize: '0.8125rem' }}>{total} résultat(s)</span>
        </div>
      </div>

      {loading ? <div className="loading"><div className="spinner"></div></div> : (
        <table className="data-table">
          <thead><tr><th>Réf</th><th>Patient</th><th>Type</th><th>Concept</th><th>Urgence</th><th>Prescripteur</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {orders.map((o: any) => (
              <tr key={o.id}>
                <td className="fw-600">{o.reference || `#${o.id}`}</td>
                <td>{o.patient_prenom} {o.patient_nom}</td>
                <td><span className={`tag ${typeLabels[o.type_order]?.tag}`}>{typeLabels[o.type_order]?.label}</span></td>
                <td>{o.concept_nom || '-'}</td>
                <td><span className={`tag ${urgenceLabels[o.urgence]?.tag}`}>{urgenceLabels[o.urgence]?.label}</span></td>
                <td>{o.orderer_prenom} {o.orderer_nom}</td>
                <td><span className={`tag ${statutLabels[o.statut]?.tag}`}>{statutLabels[o.statut]?.label}</span></td>
                <td>
                  <div className="d-flex gap-1">
                    {o.statut === 'nouveau' && <button className="btn-ghost btn-sm" onClick={() => changeStatut(o.id, 'actif')}>Activer</button>}
                    {o.statut === 'actif' && <button className="btn-ghost btn-sm" onClick={() => changeStatut(o.id, 'complete')}>Compléter</button>}
                    {['nouveau', 'actif'].includes(o.statut) && <button className="btn-ghost btn-sm text-danger" onClick={() => changeStatut(o.id, 'annule')}>Annuler</button>}
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={8} className="table-empty">Aucun ordre</td></tr>}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}><div className="modal-container modal-lg" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouvel ordre médical</h3><button className="btn-icon" onClick={() => setShowModal(false)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleCreate}><div className="modal-body">
            <div className="grid-3">
              <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Type *</label><select className="form-select" value={form.type_order} onChange={e => setForm({...form, type_order: e.target.value})}>{Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Urgence</label><select className="form-select" value={form.urgence} onChange={e => setForm({...form, urgence: e.target.value})}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="stat">STAT</option></select></div>
            </div>
            <div className="form-group"><label className="form-label">Concept (médicament, test, procédure)</label><select className="form-select" value={form.concept_id} onChange={e => setForm({...form, concept_id: e.target.value})}><option value="">Sélectionner...</option>{concepts.map((c: any) => <option key={c.id} value={c.id}>[{c.code}] {c.nom}</option>)}</select></div>
            {form.type_order === 'prescription' && (
              <div className="grid-4">
                <div className="form-group"><label className="form-label">Dosage</label><input type="text" className="form-input" value={form.dosage} onChange={e => setForm({...form, dosage: e.target.value})} placeholder="ex: 500mg" /></div>
                <div className="form-group"><label className="form-label">Fréquence</label><input type="text" className="form-input" value={form.frequence} onChange={e => setForm({...form, frequence: e.target.value})} placeholder="ex: 3x/jour" /></div>
                <div className="form-group"><label className="form-label">Durée</label><input type="text" className="form-input" value={form.duree} onChange={e => setForm({...form, duree: e.target.value})} placeholder="ex: 7 jours" /></div>
                <div className="form-group"><label className="form-label">Voie</label><select className="form-select" value={form.voie} onChange={e => setForm({...form, voie: e.target.value})}><option value="">—</option><option value="orale">Orale</option><option value="iv">IV</option><option value="im">IM</option><option value="sc">SC</option><option value="topique">Topique</option></select></div>
              </div>
            )}
            <div className="form-group"><label className="form-label">Instructions</label><textarea className="form-textarea" rows={2} value={form.instructions} onChange={e => setForm({...form, instructions: e.target.value})} /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button type="submit" className="btn-primary">Créer l'ordre</button></div></form>
        </div></div>
      )}
    </div>
  );
}