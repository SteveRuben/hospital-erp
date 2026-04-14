import { useState, useEffect } from 'react';
import { getPavillons, createPavillon, getLits, createLit, updateLitStatut, getHospitalisations, createHospitalisation, sortieHospitalisation, getLitsStats, getPatients, getMedecins, getServices } from '../services/api';
import type { Patient, Medecin, Service } from '../types';

const statutLit: Record<string, { label: string; tag: string }> = { disponible: { label: 'Disponible', tag: 'tag-green' }, occupe: { label: 'Occupé', tag: 'tag-red' }, maintenance: { label: 'Maintenance', tag: 'tag-yellow' }, reserve: { label: 'Réservé', tag: 'tag-blue' } };
const typeLit: Record<string, string> = { standard: 'Standard', soins_intensifs: 'Soins intensifs', pediatrique: 'Pédiatrique', maternite: 'Maternité', isolement: 'Isolement' };

export default function Lits() {
  const [tab, setTab] = useState<'lits' | 'hospitalisations' | 'pavillons'>('lits');
  const [pavillons, setPavillons] = useState<any[]>([]);
  const [lits, setLits] = useState<any[]>([]);
  const [hosps, setHosps] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState<string | null>(null);
  const [pavForm, setPavForm] = useState({ nom: '', etage: '', service_id: '', capacite: '', description: '' });
  const [litForm, setLitForm] = useState({ pavillon_id: '', numero: '', type_lit: 'standard' });
  const [hospForm, setHospForm] = useState({ patient_id: '', lit_id: '', medecin_id: '', service_id: '', motif: '', notes: '' });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [p, l, h, s, pat, med, srv] = await Promise.all([getPavillons(), getLits(), getHospitalisations(), getLitsStats(), getPatients({ archived: 'false' }), getMedecins(), getServices()]);
      setPavillons(p.data); setLits(l.data); setHosps(h.data); setStats(s.data); setPatients(pat.data.data); setMedecins(med.data); setServices(srv.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handlePavillon = async (e: React.FormEvent) => { e.preventDefault(); try { await createPavillon(pavForm); setShowModal(null); setPavForm({ nom: '', etage: '', service_id: '', capacite: '', description: '' }); loadAll(); } catch { alert('Erreur'); } };
  const handleLit = async (e: React.FormEvent) => { e.preventDefault(); try { await createLit(litForm); setShowModal(null); setLitForm({ pavillon_id: '', numero: '', type_lit: 'standard' }); loadAll(); } catch { alert('Erreur'); } };
  const handleHosp = async (e: React.FormEvent) => { e.preventDefault(); try { await createHospitalisation(hospForm); setShowModal(null); setHospForm({ patient_id: '', lit_id: '', medecin_id: '', service_id: '', motif: '', notes: '' }); loadAll(); } catch (err: any) { alert(err.response?.data?.error || 'Erreur'); } };
  const handleSortie = async (id: number) => { try { await sortieHospitalisation(id); loadAll(); } catch { alert('Erreur'); } };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const litsDisponibles = lits.filter((l: any) => l.statut === 'disponible');

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Lits & Hospitalisations</span></nav>
      <div className="page-header"><h1 className="page-title">Lits & Hospitalisations</h1>
        <div className="d-flex gap-1">
          {tab === 'pavillons' && <button className="btn-primary" onClick={() => setShowModal('pavillon')}><i className="bi bi-plus"></i> Pavillon</button>}
          {tab === 'lits' && <button className="btn-primary" onClick={() => setShowModal('lit')}><i className="bi bi-plus"></i> Lit</button>}
          {tab === 'hospitalisations' && <button className="btn-primary" onClick={() => setShowModal('hosp')}><i className="bi bi-plus"></i> Admission</button>}
        </div>
      </div>

      <div className="grid-4 mb-3">
        <div className="tile stat-tile"><div className="stat-value">{stats?.totalLits || 0}</div><div className="stat-label">Total lits</div></div>
        <div className="tile stat-tile"><div className="stat-value text-success">{stats?.disponibles || 0}</div><div className="stat-label">Disponibles</div></div>
        <div className="tile stat-tile"><div className="stat-value text-danger">{stats?.occupes || 0}</div><div className="stat-label">Occupés</div></div>
        <div className="tile stat-tile"><div className="stat-value">{stats?.hospitalisations || 0}</div><div className="stat-label">Hospitalisations actives</div></div>
      </div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'lits' ? 'active' : ''}`} onClick={() => setTab('lits')}>Lits</button>
        <button className={`tab-item ${tab === 'hospitalisations' ? 'active' : ''}`} onClick={() => setTab('hospitalisations')}>Hospitalisations</button>
        <button className={`tab-item ${tab === 'pavillons' ? 'active' : ''}`} onClick={() => setTab('pavillons')}>Pavillons</button>
      </div>

      {tab === 'lits' && (
        <table className="data-table"><thead><tr><th>N°</th><th>Pavillon</th><th>Étage</th><th>Type</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>{lits.map((l: any) => (
            <tr key={l.id}><td className="fw-600">{l.numero}</td><td>{l.pavillon_nom}</td><td>{l.etage || '-'}</td><td>{typeLit[l.type_lit] || l.type_lit}</td><td><span className={`tag ${statutLit[l.statut]?.tag}`}>{statutLit[l.statut]?.label}</span></td>
              <td><div className="d-flex gap-1">
                {l.statut === 'disponible' && <button className="btn-ghost btn-sm" onClick={async () => { await updateLitStatut(l.id, 'maintenance'); loadAll(); }}>Maintenance</button>}
                {l.statut === 'maintenance' && <button className="btn-ghost btn-sm" onClick={async () => { await updateLitStatut(l.id, 'disponible'); loadAll(); }}>Disponible</button>}
              </div></td></tr>
          ))}{lits.length === 0 && <tr><td colSpan={6} className="table-empty"><i className="bi bi-hospital" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Aucun lit configuré</td></tr>}</tbody>
        </table>
      )}

      {tab === 'hospitalisations' && (
        <table className="data-table"><thead><tr><th>Patient</th><th>Lit</th><th>Pavillon</th><th>Médecin</th><th>Service</th><th>Admission</th><th>Actions</th></tr></thead>
          <tbody>{hosps.map((h: any) => (
            <tr key={h.id}><td className="fw-600">{h.patient_prenom} {h.patient_nom}</td><td>{h.lit_numero || '-'}</td><td>{h.pavillon_nom || '-'}</td><td>Dr. {h.medecin_prenom} {h.medecin_nom}</td><td>{h.service_nom || '-'}</td><td>{new Date(h.date_admission).toLocaleDateString('fr-FR')}</td>
              <td><button className="btn-ghost btn-sm" onClick={() => handleSortie(h.id)}>Sortie ✓</button></td></tr>
          ))}{hosps.length === 0 && <tr><td colSpan={7} className="table-empty">Aucune hospitalisation active</td></tr>}</tbody>
        </table>
      )}

      {tab === 'pavillons' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {pavillons.map((p: any) => (
            <div className="tile" key={p.id} style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{p.nom}</h3>
              {p.etage && <p className="text-muted" style={{ fontSize: '0.75rem' }}>Étage: {p.etage}</p>}
              {p.service_nom && <p className="text-muted" style={{ fontSize: '0.75rem' }}>Service: {p.service_nom}</p>}
              <div className="d-flex gap-2 mt-1">
                <div><span style={{ fontSize: '1.25rem', fontWeight: 600 }}>{p.nb_lits}</span><span className="text-muted" style={{ fontSize: '0.75rem' }}> lits</span></div>
                <div><span style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-support-success)' }}>{p.lits_disponibles}</span><span className="text-muted" style={{ fontSize: '0.75rem' }}> dispo</span></div>
              </div>
            </div>
          ))}
          {pavillons.length === 0 && <div className="table-empty" style={{ gridColumn: '1/-1' }}>Aucun pavillon</div>}
        </div>
      )}

      {/* Modals */}
      {showModal === 'pavillon' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouveau pavillon</h3><button className="btn-icon" onClick={() => setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handlePavillon}><div className="modal-body">
            <div className="grid-2"><div className="form-group"><label className="form-label">Nom *</label><input type="text" className="form-input" value={pavForm.nom} onChange={e => setPavForm({...pavForm, nom: e.target.value})} required /></div>
            <div className="form-group"><label className="form-label">Étage</label><input type="text" className="form-input" value={pavForm.etage} onChange={e => setPavForm({...pavForm, etage: e.target.value})} /></div></div>
            <div className="grid-2"><div className="form-group"><label className="form-label">Service</label><select className="form-select" value={pavForm.service_id} onChange={e => setPavForm({...pavForm, service_id: e.target.value})}><option value="">Sélectionner...</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Capacité</label><input type="number" className="form-input" value={pavForm.capacite} onChange={e => setPavForm({...pavForm, capacite: e.target.value})} /></div></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Créer</button></div></form>
        </div></div>
      )}

      {showModal === 'lit' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouveau lit</h3><button className="btn-icon" onClick={() => setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleLit}><div className="modal-body">
            <div className="grid-3">
              <div className="form-group"><label className="form-label">Pavillon *</label><select className="form-select" value={litForm.pavillon_id} onChange={e => setLitForm({...litForm, pavillon_id: e.target.value})} required><option value="">Sélectionner...</option>{pavillons.map((p: any) => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Numéro *</label><input type="text" className="form-input" value={litForm.numero} onChange={e => setLitForm({...litForm, numero: e.target.value})} required placeholder="ex: A-101" /></div>
              <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={litForm.type_lit} onChange={e => setLitForm({...litForm, type_lit: e.target.value})}><option value="standard">Standard</option><option value="soins_intensifs">Soins intensifs</option><option value="pediatrique">Pédiatrique</option><option value="maternite">Maternité</option><option value="isolement">Isolement</option></select></div>
            </div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Créer</button></div></form>
        </div></div>
      )}

      {showModal === 'hosp' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Nouvelle admission</h3><button className="btn-icon" onClick={() => setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleHosp}><div className="modal-body">
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={hospForm.patient_id} onChange={e => setHospForm({...hospForm, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Lit</label><select className="form-select" value={hospForm.lit_id} onChange={e => setHospForm({...hospForm, lit_id: e.target.value})}><option value="">Sélectionner...</option>{litsDisponibles.map((l: any) => <option key={l.id} value={l.id}>{l.numero} ({l.pavillon_nom})</option>)}</select></div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Médecin</label><select className="form-select" value={hospForm.medecin_id} onChange={e => setHospForm({...hospForm, medecin_id: e.target.value})}><option value="">Sélectionner...</option>{medecins.map(m => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Service</label><select className="form-select" value={hospForm.service_id} onChange={e => setHospForm({...hospForm, service_id: e.target.value})}><option value="">Sélectionner...</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Motif</label><textarea className="form-textarea" rows={2} value={hospForm.motif} onChange={e => setHospForm({...hospForm, motif: e.target.value})} /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Admettre</button></div></form>
        </div></div>
      )}
    </div>
  );
}