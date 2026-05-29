import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPatient, getPatientHistorique, getRendezVous, getVitaux, createVitaux, getAllergies, createAllergie, getPathologies, createPathologie, getPrescriptions, createPrescription, getVaccinations, createVaccination, getNotes, createNote, getAlertes, createAlerte, toggleAlerte, getOrdonnances, getMedecins } from '../services/api';
import type { Patient, RendezVous, Medecin } from '../types';
import MentionTextarea from '../components/MentionTextarea';
import MentionContent from '../components/MentionContent';
import FormRenderer from '../components/FormRenderer';
import { useBranding } from '../components/BrandingProvider';
import { formatPhone } from '../components/format';
import { listFormulaires, getFormulaireReponsesPatient, postFormulaireReponse, type Formulaire as FormulaireDef, type FormulaireReponse } from '../services/api';

const tabs = ['resume','vitaux','allergies','pathologies','prescriptions','vaccinations','notes','alertes','consultations','examens','finances','rendezvous','formulaires','timeline'];
const tabLabels: Record<string,string> = { resume:'Résumé', vitaux:'Signes vitaux', allergies:'Allergies', pathologies:'Pathologies', prescriptions:'Prescriptions', vaccinations:'Vaccinations', notes:'Notes', alertes:'Alertes', consultations:'Consultations', examens:'Examens', finances:'Finances', rendezvous:'RDV', formulaires:'Formulaires', timeline:'Timeline' };

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { branding } = useBranding();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [tab, setTab] = useState('resume');
  const [loading, setLoading] = useState(true);
  const [hist, setHist] = useState<any>(null);
  const [rdvs, setRdvs] = useState<RendezVous[]>([]);
  const [vitaux, setVitauxData] = useState<any[]>([]);
  const [allergies, setAllergiesData] = useState<any[]>([]);
  const [pathologies, setPathologiesData] = useState<any[]>([]);
  const [prescriptions, setPrescriptionsData] = useState<any[]>([]);
  const [vaccinations, setVaccinationsData] = useState<any[]>([]);
  const [notesData, setNotesData] = useState<any[]>([]);
  const [alertes, setAlertesData] = useState<any[]>([]);
  const [ordonnances, setOrdonnancesData] = useState<any[]>([]);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [showModal, setShowModal] = useState<string | null>(null);

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    try {
      const pid = Number(id);
      const [p, h, r, v, al, pa, pr, va, n, alt, ord, med] = await Promise.all([
        getPatient(pid), getPatientHistorique(pid), getRendezVous({ patient_id: id }),
        getVitaux(pid), getAllergies(pid), getPathologies(pid), getPrescriptions(pid),
        getVaccinations(pid), getNotes(pid), getAlertes(pid), getOrdonnances(pid), getMedecins()
      ]);
      setPatient(p.data); setHist(h.data); setRdvs(r.data); setVitauxData(v.data);
      setAllergiesData(al.data); setPathologiesData(pa.data); setPrescriptionsData(pr.data);
      setVaccinationsData(va.data); setNotesData(n.data); setAlertesData(alt.data);
      setOrdonnancesData(ord.data); setMedecins(med.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(n);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!patient) return <div className="table-empty">Patient non trouvé</div>;

  const age = patient.date_naissance ? Math.floor((Date.now() - new Date(patient.date_naissance).getTime()) / 31557600000) : null;
  const activeAlertes = alertes.filter((a: any) => a.active);

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><a href="/app/patients">Patients</a><span className="breadcrumb-separator">/</span><span>{patient.prenom} {patient.nom}</span></nav>

      {activeAlertes.length > 0 && activeAlertes.map((a: any) => (
        <div key={a.id} className={`notification notification-${a.severite === 'critical' ? 'error' : a.severite === 'danger' ? 'error' : a.severite} mb-1`}>
          <i className="bi bi-exclamation-triangle"></i><span>{a.message}</span>
          <button className="btn-ghost btn-sm" style={{marginLeft:'auto'}} onClick={async () => { await toggleAlerte(a.id); loadAll(); }}>Masquer</button>
        </div>
      ))}

      <div className="patient-banner">
        <div className="patient-avatar"><i className="bi bi-person"></i></div>
        <div className="patient-info">
          <h2>{patient.prenom} {patient.nom}</h2>
          <div className="patient-meta">
            <span>ID: #{patient.id}</span>
            {age !== null && <span>{age} ans</span>}
            {patient.telephone && <span>{formatPhone(patient.telephone, branding.code_pays)}</span>}
          </div>
        </div>
        <div className="patient-actions">
          <button className="btn-primary btn-sm" onClick={() => navigate('/app/rendezvous')}><i className="bi bi-calendar-plus"></i> RDV</button>
          <button className="btn-primary btn-sm" onClick={() => navigate('/app/consultations')}><i className="bi bi-clipboard-plus"></i> Consultation</button>
          <button className="btn-primary btn-sm" onClick={() => setShowModal('alerte')}><i className="bi bi-bell-fill"></i> Alerte</button>
        </div>
      </div>

      <div className="tabs" style={{overflowX:'auto',flexWrap:'nowrap'}}>
        {tabs.map(t => <button key={t} className={`tab-item ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{tabLabels[t]}</button>)}
      </div>

      <div className="mt-2">
        {tab === 'resume' && <ResumeTab patient={patient} hist={hist} rdvs={rdvs} vitaux={vitaux} allergies={allergies} pathologies={pathologies} fmt={fmt} />}
        {tab === 'vitaux' && <VitauxTab data={vitaux} patientId={patient.id} medecins={medecins} onRefresh={loadAll} showModal={showModal} setShowModal={setShowModal} />}
        {tab === 'allergies' && <AllergiesTab data={allergies} patientId={patient.id} onRefresh={loadAll} showModal={showModal} setShowModal={setShowModal} />}
        {tab === 'pathologies' && <PathologiesTab data={pathologies} patientId={patient.id} onRefresh={loadAll} showModal={showModal} setShowModal={setShowModal} />}
        {tab === 'prescriptions' && <PrescriptionsTab data={prescriptions} patientId={patient.id} medecins={medecins} onRefresh={loadAll} showModal={showModal} setShowModal={setShowModal} />}
        {tab === 'vaccinations' && <VaccinationsTab data={vaccinations} patientId={patient.id} medecins={medecins} onRefresh={loadAll} showModal={showModal} setShowModal={setShowModal} />}
        {tab === 'notes' && <NotesTab data={notesData} patientId={patient.id} onRefresh={loadAll} showModal={showModal} setShowModal={setShowModal} />}
        {tab === 'alertes' && <AlertesTab data={alertes} patientId={patient.id} onRefresh={loadAll} showModal={showModal} setShowModal={setShowModal} />}
        {tab === 'consultations' && <table className="data-table"><thead><tr><th>Date</th><th>Médecin</th><th>Service</th><th>Diagnostic</th></tr></thead><tbody>{hist?.consultations?.map((c:any) => <tr key={c.id}><td>{new Date(c.date_consultation).toLocaleDateString('fr-FR')}</td><td>Dr. {c.medecin_prenom} {c.medecin_nom}</td><td>{c.service_nom}</td><td>{c.diagnostic||'-'}</td></tr>)}{!hist?.consultations?.length && <tr><td colSpan={4} className="table-empty">Aucune</td></tr>}</tbody></table>}
        {tab === 'examens' && <table className="data-table"><thead><tr><th>Date</th><th>Type</th><th>Résultat</th><th>Montant</th></tr></thead><tbody>{hist?.examens?.map((e:any) => <tr key={e.id}><td>{new Date(e.date_examen).toLocaleDateString('fr-FR')}</td><td>{e.type_examen}</td><td>{e.resultat||'-'}</td><td>{e.montant ? fmt(e.montant) : '-'}</td></tr>)}{!hist?.examens?.length && <tr><td colSpan={4} className="table-empty">Aucun</td></tr>}</tbody></table>}
        {tab === 'finances' && <table className="data-table"><thead><tr><th>Date</th><th>Type</th><th>Montant</th><th>Paiement</th></tr></thead><tbody>{hist?.recettes?.map((r:any) => <tr key={r.id}><td>{new Date(r.date_recette).toLocaleDateString('fr-FR')}</td><td>{r.type_acte}</td><td className="text-success fw-600">{fmt(r.montant)}</td><td><span className="tag tag-gray">{r.mode_paiement}</span></td></tr>)}{!hist?.recettes?.length && <tr><td colSpan={4} className="table-empty">Aucun</td></tr>}</tbody></table>}
        {tab === 'rendezvous' && <table className="data-table"><thead><tr><th>Date</th><th>Médecin</th><th>Motif</th><th>Statut</th></tr></thead><tbody>{rdvs.map(r => <tr key={r.id}><td>{new Date(r.date_rdv).toLocaleString('fr-FR')}</td><td>Dr. {r.medecin_prenom} {r.medecin_nom}</td><td>{r.motif||'-'}</td><td><span className={`tag ${r.statut==='termine'?'tag-green':r.statut==='annule'?'tag-red':'tag-blue'}`}>{r.statut}</span></td></tr>)}{!rdvs.length && <tr><td colSpan={4} className="table-empty">Aucun</td></tr>}</tbody></table>}
        {tab === 'formulaires' && <FormulairesTab patientId={patient.id} />}
        {tab === 'timeline' && <TimelineTab hist={hist} fmt={fmt} />}
      </div>

      {showModal === 'alerte' && <AlerteModal patientId={patient.id} onClose={() => setShowModal(null)} onRefresh={loadAll} />}
    </div>
  );
}

// === SUB COMPONENTS ===

function ResumeTab({ patient, hist, rdvs, vitaux, allergies, pathologies, fmt }: any) {
  const lastVitaux = vitaux[0];
  return (
    <div className="grid-2">
      <div className="tile">
        <h4 style={{marginBottom:'1rem',fontSize:'0.875rem',fontWeight:600}}>Informations</h4>
        <div className="grid-2">
          <div><span className="form-label">Date naissance</span><p>{patient.date_naissance ? new Date(patient.date_naissance).toLocaleDateString('fr-FR') : '-'}</p></div>
          <div><span className="form-label">Adresse</span><p>{patient.adresse || '-'}</p></div>
          <div><span className="form-label">Profession</span><p>{patient.profession || '-'}</p></div>
          <div><span className="form-label">Contact urgence</span><p>{patient.contact_urgence || '-'}</p></div>
        </div>
      </div>
      <div className="tile">
        <h4 style={{marginBottom:'1rem',fontSize:'0.875rem',fontWeight:600}}>Derniers signes vitaux</h4>
        {lastVitaux ? (
          <div className="grid-3">
            {lastVitaux.temperature && <div><span className="form-label">Température</span><p>{lastVitaux.temperature}°C</p></div>}
            {lastVitaux.tension_systolique && <div><span className="form-label">Tension</span><p>{lastVitaux.tension_systolique}/{lastVitaux.tension_diastolique} mmHg</p></div>}
            {lastVitaux.pouls && <div><span className="form-label">Pouls</span><p>{lastVitaux.pouls} bpm</p></div>}
            {lastVitaux.poids && <div><span className="form-label">Poids</span><p>{lastVitaux.poids} kg</p></div>}
            {lastVitaux.taille && <div><span className="form-label">Taille</span><p>{lastVitaux.taille} cm</p></div>}
            {lastVitaux.saturation_o2 && <div><span className="form-label">SpO2</span><p>{lastVitaux.saturation_o2}%</p></div>}
          </div>
        ) : <p className="text-muted">Aucune mesure</p>}
      </div>
      <div className="tile">
        <h4 style={{marginBottom:'0.5rem',fontSize:'0.875rem',fontWeight:600}}>Allergies actives</h4>
        {allergies.filter((a:any)=>a.active).map((a:any) => <span key={a.id} className={`tag ${a.severite==='severe'||a.severite==='fatale'?'tag-red':'tag-orange'}`} style={{marginRight:'0.25rem'}}>{a.allergene}</span>)}
        {!allergies.filter((a:any)=>a.active).length && <p className="text-muted">Aucune</p>}
      </div>
      <div className="tile">
        <h4 style={{marginBottom:'0.5rem',fontSize:'0.875rem',fontWeight:600}}>Pathologies actives</h4>
        {pathologies.filter((p:any)=>p.statut==='active').map((p:any) => <span key={p.id} className="tag tag-purple" style={{marginRight:'0.25rem'}}>{p.nom}</span>)}
        {!pathologies.filter((p:any)=>p.statut==='active').length && <p className="text-muted">Aucune</p>}
      </div>
    </div>
  );
}

function VitauxTab({ data, patientId, medecins, onRefresh, showModal, setShowModal }: any) {
  const [form, setForm] = useState({ patient_id: patientId, medecin_id: '', temperature: '', tension_systolique: '', tension_diastolique: '', pouls: '', frequence_respiratoire: '', saturation_o2: '', poids: '', taille: '', glycemie: '', notes: '' });
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); await createVitaux(form); setShowModal(null); onRefresh(); };
  return (
    <div>
      <div className="d-flex justify-between align-center mb-2"><h3 style={{fontSize:'1rem'}}>Signes vitaux</h3><button className="btn-primary btn-sm" onClick={() => setShowModal('vitaux')}><i className="bi bi-plus"></i> Mesure</button></div>
      <table className="data-table"><thead><tr><th>Date</th><th>T°</th><th>TA</th><th>Pouls</th><th>SpO2</th><th>Poids</th><th>Taille</th></tr></thead>
        <tbody>{data.map((v:any) => <tr key={v.id}><td>{new Date(v.date_mesure).toLocaleString('fr-FR')}</td><td>{v.temperature ? `${v.temperature}°C` : '-'}</td><td>{v.tension_systolique ? `${v.tension_systolique}/${v.tension_diastolique}` : '-'}</td><td>{v.pouls || '-'}</td><td>{v.saturation_o2 ? `${v.saturation_o2}%` : '-'}</td><td>{v.poids ? `${v.poids}kg` : '-'}</td><td>{v.taille ? `${v.taille}cm` : '-'}</td></tr>)}
        {!data.length && <tr><td colSpan={7} className="table-empty">Aucune mesure</td></tr>}</tbody>
      </table>
      {showModal === 'vitaux' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}><div className="modal-container modal-lg" onClick={e=>e.stopPropagation()}>
          <div className="modal-header"><h3>Nouveaux signes vitaux</h3><button className="btn-icon" onClick={() => setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleSubmit}><div className="modal-body"><div className="grid-3">
            <div className="form-group"><label className="form-label">Température (°C)</label><input type="number" step="0.1" className="form-input" value={form.temperature} onChange={e=>setForm({...form,temperature:e.target.value})} /></div>
            <div className="form-group"><label className="form-label">TA Systolique</label><input type="number" className="form-input" value={form.tension_systolique} onChange={e=>setForm({...form,tension_systolique:e.target.value})} /></div>
            <div className="form-group"><label className="form-label">TA Diastolique</label><input type="number" className="form-input" value={form.tension_diastolique} onChange={e=>setForm({...form,tension_diastolique:e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Pouls (bpm)</label><input type="number" className="form-input" value={form.pouls} onChange={e=>setForm({...form,pouls:e.target.value})} /></div>
            <div className="form-group"><label className="form-label">SpO2 (%)</label><input type="number" className="form-input" value={form.saturation_o2} onChange={e=>setForm({...form,saturation_o2:e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Fréq. resp.</label><input type="number" className="form-input" value={form.frequence_respiratoire} onChange={e=>setForm({...form,frequence_respiratoire:e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Poids (kg)</label><input type="number" step="0.1" className="form-input" value={form.poids} onChange={e=>setForm({...form,poids:e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Taille (cm)</label><input type="number" step="0.1" className="form-input" value={form.taille} onChange={e=>setForm({...form,taille:e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Glycémie</label><input type="number" step="0.01" className="form-input" value={form.glycemie} onChange={e=>setForm({...form,glycemie:e.target.value})} /></div>
          </div></div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={()=>setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer</button></div></form>
        </div></div>
      )}
    </div>
  );
}

function AllergiesTab({ data, patientId, onRefresh, showModal, setShowModal }: any) {
  const [form, setForm] = useState({ patient_id: patientId, allergene: '', type_allergie: 'medicament', severite: 'legere', reaction: '', date_debut: '' });
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); await createAllergie(form); setShowModal(null); onRefresh(); };
  return (
    <div>
      <div className="d-flex justify-between align-center mb-2"><h3 style={{fontSize:'1rem'}}>Allergies</h3><button className="btn-primary btn-sm" onClick={() => setShowModal('allergie')}><i className="bi bi-plus"></i> Allergie</button></div>
      <table className="data-table"><thead><tr><th>Allergène</th><th>Type</th><th>Sévérité</th><th>Réaction</th><th>Statut</th></tr></thead>
        <tbody>{data.map((a:any) => <tr key={a.id}><td>{a.allergene}</td><td><span className="tag tag-blue">{a.type_allergie}</span></td><td><span className={`tag ${a.severite==='severe'||a.severite==='fatale'?'tag-red':a.severite==='moderee'?'tag-orange':'tag-yellow'}`}>{a.severite}</span></td><td>{a.reaction||'-'}</td><td>{a.active ? <span className="tag tag-red">Active</span> : <span className="tag tag-gray">Inactive</span>}</td></tr>)}
        {!data.length && <tr><td colSpan={5} className="table-empty">Aucune allergie</td></tr>}</tbody>
      </table>
      {showModal === 'allergie' && (
        <div className="modal-overlay" onClick={()=>setShowModal(null)}><div className="modal-container" onClick={e=>e.stopPropagation()}>
          <div className="modal-header"><h3>Nouvelle allergie</h3><button className="btn-icon" onClick={()=>setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleSubmit}><div className="modal-body">
            <div className="form-group"><label className="form-label">Allergène *</label><input type="text" className="form-input" value={form.allergene} onChange={e=>setForm({...form,allergene:e.target.value})} required /></div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type_allergie} onChange={e=>setForm({...form,type_allergie:e.target.value})}><option value="medicament">Médicament</option><option value="alimentaire">Alimentaire</option><option value="environnement">Environnement</option><option value="autre">Autre</option></select></div>
              <div className="form-group"><label className="form-label">Sévérité</label><select className="form-select" value={form.severite} onChange={e=>setForm({...form,severite:e.target.value})}><option value="legere">Légère</option><option value="moderee">Modérée</option><option value="severe">Sévère</option><option value="fatale">Fatale</option></select></div>
            </div>
            <div className="form-group"><label className="form-label">Réaction</label><input type="text" className="form-input" value={form.reaction} onChange={e=>setForm({...form,reaction:e.target.value})} /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={()=>setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer</button></div></form>
        </div></div>
      )}
    </div>
  );
}

function PathologiesTab({ data, patientId, onRefresh, showModal, setShowModal }: any) {
  const [form, setForm] = useState({ patient_id: patientId, nom: '', code_cim: '', statut: 'active', date_debut: '', notes: '' });
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); await createPathologie(form); setShowModal(null); onRefresh(); };
  return (
    <div>
      <div className="d-flex justify-between align-center mb-2"><h3 style={{fontSize:'1rem'}}>Pathologies</h3><button className="btn-primary btn-sm" onClick={() => setShowModal('pathologie')}><i className="bi bi-plus"></i> Pathologie</button></div>
      <table className="data-table"><thead><tr><th>Nom</th><th>Code CIM</th><th>Statut</th><th>Début</th><th>Notes</th></tr></thead>
        <tbody>{data.map((p:any) => <tr key={p.id}><td>{p.nom}</td><td>{p.code_cim||'-'}</td><td><span className={`tag ${p.statut==='active'?'tag-red':p.statut==='resolue'?'tag-green':'tag-gray'}`}>{p.statut}</span></td><td>{p.date_debut ? new Date(p.date_debut).toLocaleDateString('fr-FR') : '-'}</td><td>{p.notes||'-'}</td></tr>)}
        {!data.length && <tr><td colSpan={5} className="table-empty">Aucune pathologie</td></tr>}</tbody>
      </table>
      {showModal === 'pathologie' && (
        <div className="modal-overlay" onClick={()=>setShowModal(null)}><div className="modal-container" onClick={e=>e.stopPropagation()}>
          <div className="modal-header"><h3>Nouvelle pathologie</h3><button className="btn-icon" onClick={()=>setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleSubmit}><div className="modal-body">
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Nom *</label><input type="text" className="form-input" value={form.nom} onChange={e=>setForm({...form,nom:e.target.value})} required /></div>
              <div className="form-group"><label className="form-label">Code CIM</label><input type="text" className="form-input" value={form.code_cim} onChange={e=>setForm({...form,code_cim:e.target.value})} /></div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Statut</label><select className="form-select" value={form.statut} onChange={e=>setForm({...form,statut:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option><option value="resolue">Résolue</option></select></div>
              <div className="form-group"><label className="form-label">Date début</label><input type="date" className="form-input" value={form.date_debut} onChange={e=>setForm({...form,date_debut:e.target.value})} /></div>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={()=>setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer</button></div></form>
        </div></div>
      )}
    </div>
  );
}

function PrescriptionsTab({ data, patientId, medecins, onRefresh, showModal, setShowModal }: any) {
  const [form, setForm] = useState({ patient_id: patientId, medecin_id: '', medicament: '', dosage: '', frequence: '', duree: '', voie: '', instructions: '', date_debut: '', date_fin: '' });
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); await createPrescription(form); setShowModal(null); onRefresh(); };
  return (
    <div>
      <div className="d-flex justify-between align-center mb-2"><h3 style={{fontSize:'1rem'}}>Prescriptions</h3><button className="btn-primary btn-sm" onClick={() => setShowModal('prescription')}><i className="bi bi-plus"></i> Prescription</button></div>
      <table className="data-table"><thead><tr><th>Médicament</th><th>Dosage</th><th>Fréquence</th><th>Durée</th><th>Voie</th><th>Médecin</th><th>Statut</th></tr></thead>
        <tbody>{data.map((p:any) => <tr key={p.id}><td className="fw-600">{p.medicament}</td><td>{p.dosage||'-'}</td><td>{p.frequence||'-'}</td><td>{p.duree||'-'}</td><td>{p.voie||'-'}</td><td>Dr. {p.medecin_prenom} {p.medecin_nom}</td><td><span className={`tag ${p.statut==='active'?'tag-green':p.statut==='terminee'?'tag-gray':'tag-red'}`}>{p.statut}</span></td></tr>)}
        {!data.length && <tr><td colSpan={7} className="table-empty">Aucune prescription</td></tr>}</tbody>
      </table>
      {showModal === 'prescription' && (
        <div className="modal-overlay" onClick={()=>setShowModal(null)}><div className="modal-container modal-lg" onClick={e=>e.stopPropagation()}>
          <div className="modal-header"><h3>Nouvelle prescription</h3><button className="btn-icon" onClick={()=>setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleSubmit}><div className="modal-body">
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Médicament *</label><input type="text" className="form-input" value={form.medicament} onChange={e=>setForm({...form,medicament:e.target.value})} required /></div>
              <div className="form-group"><label className="form-label">Médecin</label><select className="form-select" value={form.medecin_id} onChange={e=>setForm({...form,medecin_id:e.target.value})}><option value="">Sélectionner...</option>{medecins.map((m:any) => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>)}</select></div>
            </div>
            <div className="grid-3">
              <div className="form-group"><label className="form-label">Dosage</label><input type="text" className="form-input" value={form.dosage} onChange={e=>setForm({...form,dosage:e.target.value})} placeholder="ex: 500mg" /></div>
              <div className="form-group"><label className="form-label">Fréquence</label><input type="text" className="form-input" value={form.frequence} onChange={e=>setForm({...form,frequence:e.target.value})} placeholder="ex: 3x/jour" /></div>
              <div className="form-group"><label className="form-label">Durée</label><input type="text" className="form-input" value={form.duree} onChange={e=>setForm({...form,duree:e.target.value})} placeholder="ex: 7 jours" /></div>
            </div>
            <div className="form-group"><label className="form-label">Voie d'administration</label><select className="form-select" value={form.voie} onChange={e=>setForm({...form,voie:e.target.value})}><option value="">Sélectionner...</option><option value="orale">Orale</option><option value="iv">Intraveineuse</option><option value="im">Intramusculaire</option><option value="sc">Sous-cutanée</option><option value="topique">Topique</option><option value="rectale">Rectale</option></select></div>
            <div className="form-group"><label className="form-label">Instructions</label><textarea className="form-textarea" rows={2} value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})} /></div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={()=>setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Prescrire</button></div></form>
        </div></div>
      )}
    </div>
  );
}

function VaccinationsTab({ data, patientId, medecins, onRefresh, showModal, setShowModal }: any) {
  const [form, setForm] = useState({ patient_id: patientId, medecin_id: '', vaccin: '', lot: '', dose: '', site_injection: '', date_vaccination: '', date_rappel: '', notes: '' });
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); await createVaccination(form); setShowModal(null); onRefresh(); };
  return (
    <div>
      <div className="d-flex justify-between align-center mb-2"><h3 style={{fontSize:'1rem'}}>Vaccinations</h3><button className="btn-primary btn-sm" onClick={() => setShowModal('vaccination')}><i className="bi bi-plus"></i> Vaccination</button></div>
      <table className="data-table"><thead><tr><th>Date</th><th>Vaccin</th><th>Dose</th><th>Lot</th><th>Site</th><th>Rappel</th></tr></thead>
        <tbody>{data.map((v:any) => <tr key={v.id}><td>{new Date(v.date_vaccination).toLocaleDateString('fr-FR')}</td><td className="fw-600">{v.vaccin}</td><td>{v.dose||'-'}</td><td>{v.lot||'-'}</td><td>{v.site_injection||'-'}</td><td>{v.date_rappel ? new Date(v.date_rappel).toLocaleDateString('fr-FR') : '-'}</td></tr>)}
        {!data.length && <tr><td colSpan={6} className="table-empty">Aucune vaccination</td></tr>}</tbody>
      </table>
      {showModal === 'vaccination' && (
        <div className="modal-overlay" onClick={()=>setShowModal(null)}><div className="modal-container" onClick={e=>e.stopPropagation()}>
          <div className="modal-header"><h3>Nouvelle vaccination</h3><button className="btn-icon" onClick={()=>setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleSubmit}><div className="modal-body">
            <div className="form-group"><label className="form-label">Vaccin *</label><input type="text" className="form-input" value={form.vaccin} onChange={e=>setForm({...form,vaccin:e.target.value})} required /></div>
            <div className="grid-3">
              <div className="form-group"><label className="form-label">Dose</label><input type="text" className="form-input" value={form.dose} onChange={e=>setForm({...form,dose:e.target.value})} placeholder="ex: 1ère dose" /></div>
              <div className="form-group"><label className="form-label">Lot</label><input type="text" className="form-input" value={form.lot} onChange={e=>setForm({...form,lot:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Site injection</label><input type="text" className="form-input" value={form.site_injection} onChange={e=>setForm({...form,site_injection:e.target.value})} placeholder="ex: bras gauche" /></div>
            </div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={form.date_vaccination} onChange={e=>setForm({...form,date_vaccination:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Date rappel</label><input type="date" className="form-input" value={form.date_rappel} onChange={e=>setForm({...form,date_rappel:e.target.value})} /></div>
            </div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={()=>setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer</button></div></form>
        </div></div>
      )}
    </div>
  );
}

function NotesTab({ data, patientId, onRefresh, showModal, setShowModal }: any) {
  const [form, setForm] = useState({ patient_id: patientId, titre: '', contenu: '', type_note: 'general' });
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); await createNote(form); setShowModal(null); onRefresh(); };
  const typeColors: Record<string,string> = { general:'tag-gray', clinique:'tag-blue', infirmier:'tag-green', administratif:'tag-purple' };
  return (
    <div>
      <div className="d-flex justify-between align-center mb-2"><h3 style={{fontSize:'1rem'}}>Notes & Commentaires</h3><button className="btn-primary btn-sm" onClick={() => setShowModal('note')}><i className="bi bi-plus"></i> Note</button></div>
      {data.map((n:any) => (
        <div key={n.id} className="tile mb-1">
          <div className="d-flex justify-between align-center mb-1">
            <div className="d-flex align-center gap-1"><span className={`tag ${typeColors[n.type_note]||'tag-gray'}`}>{n.type_note}</span><strong>{n.titre || 'Sans titre'}</strong></div>
            <span className="text-muted" style={{fontSize:'0.75rem'}}>{new Date(n.created_at).toLocaleString('fr-FR')} — {n.auteur_prenom} {n.auteur_nom}</span>
          </div>
          <p style={{fontSize:'0.875rem'}}><MentionContent content={n.contenu} mentions={n.mentions} /></p>
        </div>
      ))}
      {!data.length && <div className="table-empty"><i className="bi bi-journal-text" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Aucune note</div>}
      {showModal === 'note' && (
        <div className="modal-overlay" onClick={()=>setShowModal(null)}><div className="modal-container" onClick={e=>e.stopPropagation()}>
          <div className="modal-header"><h3>Nouvelle note</h3><button className="btn-icon" onClick={()=>setShowModal(null)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleSubmit}><div className="modal-body">
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Titre</label><input type="text" className="form-input" value={form.titre} onChange={e=>setForm({...form,titre:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type_note} onChange={e=>setForm({...form,type_note:e.target.value})}><option value="general">Général</option><option value="clinique">Clinique</option><option value="infirmier">Infirmier</option><option value="administratif">Administratif</option></select></div>
            </div>
            <div className="form-group">
              <label className="form-label">Contenu * <span className="text-muted" style={{fontSize:'0.75rem',fontWeight:400}}>— tapez @ pour mentionner un collègue</span></label>
              <MentionTextarea rows={4} value={form.contenu} onChange={v => setForm({ ...form, contenu: v })} required />
            </div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={()=>setShowModal(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer</button></div></form>
        </div></div>
      )}
    </div>
  );
}

function AlertesTab({ data, patientId, onRefresh, showModal, setShowModal }: any) {
  const sevColors: Record<string,string> = { info:'tag-blue', warning:'tag-yellow', danger:'tag-orange', critical:'tag-red' };
  return (
    <div>
      <div className="d-flex justify-between align-center mb-2"><h3 style={{fontSize:'1rem'}}>Alertes</h3><button className="btn-primary btn-sm" onClick={() => setShowModal('alerte')}><i className="bi bi-plus"></i> Alerte</button></div>
      <table className="data-table"><thead><tr><th>Type</th><th>Message</th><th>Sévérité</th><th>Statut</th><th></th></tr></thead>
        <tbody>{data.map((a:any) => <tr key={a.id}><td><span className="tag tag-gray">{a.type_alerte}</span></td><td>{a.message}</td><td><span className={`tag ${sevColors[a.severite]||'tag-gray'}`}>{a.severite}</span></td><td>{a.active ? <span className="tag tag-green">Active</span> : <span className="tag tag-gray">Inactive</span>}</td><td><button className="btn-ghost btn-sm" onClick={async () => { await toggleAlerte(a.id); onRefresh(); }}>{a.active ? 'Désactiver' : 'Activer'}</button></td></tr>)}
        {!data.length && <tr><td colSpan={5} className="table-empty">Aucune alerte</td></tr>}</tbody>
      </table>
    </div>
  );
}

function AlerteModal({ patientId, onClose, onRefresh }: { patientId: number; onClose: () => void; onRefresh: () => void }) {
  const [form, setForm] = useState({ patient_id: patientId, type_alerte: 'autre', message: '', severite: 'info' });
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); await createAlerte(form); onClose(); onRefresh(); };
  return (
    <div className="modal-overlay" onClick={onClose}><div className="modal-container" onClick={e=>e.stopPropagation()}>
      <div className="modal-header"><h3>Nouvelle alerte</h3><button className="btn-icon" onClick={onClose}><i className="bi bi-x-lg"></i></button></div>
      <form onSubmit={handleSubmit}><div className="modal-body">
        <div className="grid-2">
          <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type_alerte} onChange={e=>setForm({...form,type_alerte:e.target.value})}><option value="allergie">Allergie</option><option value="pathologie">Pathologie</option><option value="medicament">Médicament</option><option value="administratif">Administratif</option><option value="urgent">Urgent</option><option value="autre">Autre</option></select></div>
          <div className="form-group"><label className="form-label">Sévérité</label><select className="form-select" value={form.severite} onChange={e=>setForm({...form,severite:e.target.value})}><option value="info">Info</option><option value="warning">Warning</option><option value="danger">Danger</option><option value="critical">Critique</option></select></div>
        </div>
        <div className="form-group"><label className="form-label">Message *</label><textarea className="form-textarea" rows={3} value={form.message} onChange={e=>setForm({...form,message:e.target.value})} required /></div>
      </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={onClose}>Annuler</button><button type="submit" className="btn-primary">Créer l'alerte</button></div></form>
    </div></div>
  );
}

function TimelineTab({ hist, fmt }: any) {
  // Flatten every clinical category the historique endpoint returns into a
  // unified event stream sorted desc. Each line has a distinctive icon/color
  // so the reader can scan the chronology and spot the type of activity at a
  // glance. Notes / allergies / pathologies use the createdAt as the
  // canonical timestamp since they don't have a domain-specific date.
  const medecinLabel = (prenom?: string | null, nom?: string | null) =>
    (prenom || nom) ? ` — Dr. ${prenom ?? ''} ${nom ?? ''}`.trimEnd() : '';
  const auteurLabel = (prenom?: string | null, nom?: string | null) =>
    (prenom || nom) ? ` — ${prenom ?? ''} ${nom ?? ''}`.trim() : '';

  const timeline: Array<{ date: string; title: string; detail: string; icon: string; color: string }> = [
    ...(hist?.consultations?.map((c: any) => ({ date: c.date_consultation, title: `Consultation${c.service_nom ? ' — ' + c.service_nom : ''}${medecinLabel(c.medecin_prenom, c.medecin_nom)}`, detail: c.diagnostic || c.motif || '', icon: 'bi-clipboard-pulse', color: '#0f62fe' })) || []),
    ...(hist?.examens?.map((e: any) => ({ date: e.date_examen, title: `Examen — ${e.type_examen}`, detail: e.resultat || 'En attente', icon: 'bi-flask', color: '#8a3ffc' })) || []),
    ...(hist?.recettes?.map((r: any) => ({ date: r.date_recette, title: `Paiement — ${r.type_acte}`, detail: `${fmt(r.montant)}${r.mode_paiement ? ' • ' + r.mode_paiement : ''}`, icon: 'bi-cash', color: '#198038' })) || []),
    ...(hist?.notes?.map((n: any) => ({ date: n.created_at, title: `Note ${n.type_note}${n.titre ? ' — ' + n.titre : ''}${auteurLabel(n.auteur_prenom, n.auteur_nom)}`, detail: n.contenu, icon: 'bi-journal-text', color: '#525252' })) || []),
    ...(hist?.allergies?.map((a: any) => ({ date: a.created_at, title: `Allergie — ${a.allergene}`, detail: `${a.severite || 'non spécifié'}${a.reaction ? ' • ' + a.reaction : ''}`, icon: 'bi-exclamation-triangle', color: '#f1c21b' })) || []),
    ...(hist?.pathologies?.map((p: any) => ({ date: p.created_at, title: `Pathologie — ${p.nom}`, detail: `${p.statut}${p.code_cim ? ' • CIM ' + p.code_cim : ''}`, icon: 'bi-heart-pulse', color: '#da1e28' })) || []),
    ...(hist?.prescriptions?.map((p: any) => ({ date: p.created_at, title: `Prescription — ${p.medicament}${medecinLabel(p.medecin_prenom, p.medecin_nom)}`, detail: [p.dosage, p.frequence, p.duree].filter(Boolean).join(' • '), icon: 'bi-capsule', color: '#1192e8' })) || []),
    ...(hist?.ordonnances?.map((o: any) => ({ date: o.created_at, title: `Ordonnance${medecinLabel(o.medecin_prenom, o.medecin_nom)}`, detail: o.notes || o.statut, icon: 'bi-receipt', color: '#0043ce' })) || []),
    ...(hist?.vaccinations?.map((v: any) => ({ date: v.date_vaccination, title: `Vaccination — ${v.vaccin}`, detail: `${v.dose || ''}${v.date_rappel ? ' • Rappel ' + new Date(v.date_rappel).toLocaleDateString('fr-FR') : ''}`, icon: 'bi-shield-plus', color: '#198038' })) || []),
    ...(hist?.alertes?.map((a: any) => ({ date: a.created_at, title: `Alerte ${a.severite} — ${a.type_alerte || 'générale'}${auteurLabel(a.created_prenom, a.created_nom)}`, detail: a.message, icon: 'bi-bell-fill', color: '#fa4d56' })) || []),
    ...(hist?.rendez_vous?.map((r: any) => ({ date: r.date_rdv, title: `Rendez-vous${r.service_nom ? ' — ' + r.service_nom : ''}${medecinLabel(r.medecin_prenom, r.medecin_nom)}`, detail: `${r.statut}${r.motif ? ' • ' + r.motif : ''}`, icon: 'bi-calendar-event', color: '#0f62fe' })) || []),
    ...(hist?.vitaux?.map((v: any) => ({ date: v.date_mesure, title: 'Signes vitaux', detail: [v.temperature && `T° ${v.temperature}`, (v.tension_systolique && v.tension_diastolique) && `TA ${v.tension_systolique}/${v.tension_diastolique}`, v.pouls && `P ${v.pouls}`, v.poids && `${v.poids}kg`, v.glycemie && `Glyc ${v.glycemie}`].filter(Boolean).join(' • '), icon: 'bi-activity', color: '#8a3ffc' })) || []),
    ...(hist?.hospitalisations?.flatMap((h: any) => {
      const out: Array<any> = [{ date: h.date_admission, title: `Admission${h.service_nom ? ' — ' + h.service_nom : ''}${medecinLabel(h.medecin_prenom, h.medecin_nom)}`, detail: h.motif || '', icon: 'bi-hospital', color: '#0f62fe' }];
      if (h.date_sortie) out.push({ date: h.date_sortie, title: 'Sortie d\'hospitalisation', detail: '', icon: 'bi-box-arrow-right', color: '#198038' });
      return out;
    }) || []),
    ...(hist?.visites?.map((v: any) => ({ date: v.date_debut, title: `Visite ${v.type_visite}${v.service_nom ? ' — ' + v.service_nom : ''}`, detail: v.statut, icon: 'bi-door-open', color: '#525252' })) || []),
    ...(hist?.documents?.map((d: any) => ({ date: d.created_at, title: `Document — ${d.type_document || 'fichier'}`, detail: d.description || '', icon: 'bi-file-earmark', color: '#525252' })) || []),
  ]
    .filter(e => e.date) // skip rows with no usable timestamp
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="timeline">
      {timeline.map((item, i) => (
        <div className="timeline-item" key={i}>
          <div className="timeline-date">{new Date(item.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div>
          <div className="timeline-content">
            <div className="d-flex align-center gap-1"><i className={`bi ${item.icon}`} style={{ color: item.color }}></i><strong>{item.title}</strong></div>
            {item.detail && <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>{item.detail}</p>}
          </div>
        </div>
      ))}
      {!timeline.length && <div className="table-empty">Aucune activité</div>}
    </div>
  );
}

function FormulairesTab({ patientId }: { patientId: number }) {
  const [forms, setForms] = useState<FormulaireDef[]>([]);
  const [reponses, setReponses] = useState<FormulaireReponse[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<FormulaireReponse | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [f, r] = await Promise.all([
        listFormulaires({ actif: true }),
        getFormulaireReponsesPatient(patientId),
      ]);
      setForms(f.data);
      setReponses(r.data);
    } catch { /* ignored — empty state */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [patientId]);

  const selectedForm = forms.find(f => f.id === selectedFormId);

  const handleSubmit = async (donnees: Record<string, unknown>) => {
    if (!selectedFormId) return;
    await postFormulaireReponse({ formulaire_id: selectedFormId, patient_id: patientId, donnees });
    setSelectedFormId(null);
    load();
  };

  if (loading) return <div className="text-muted" style={{ fontSize: '0.8125rem' }}>Chargement…</div>;

  return (
    <div>
      <div className="d-flex justify-between align-center mb-2">
        <h3 style={{ fontSize: '1rem' }}>Formulaires</h3>
        <select className="form-select" style={{ maxWidth: '280px' }} value={selectedFormId ?? ''} onChange={e => setSelectedFormId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— Remplir un formulaire —</option>
          {forms.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
        </select>
      </div>

      {selectedForm && selectedForm.schema && (
        <div className="tile mb-2" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.25rem' }}>{selectedForm.nom}</h4>
          {selectedForm.description && <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>{selectedForm.description}</p>}
          <FormRenderer schema={selectedForm.schema} onSubmit={handleSubmit} onCancel={() => setSelectedFormId(null)} submitLabel="Enregistrer la réponse" />
        </div>
      )}

      <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>Réponses précédentes</h4>
      {reponses.length === 0 ? (
        <div className="table-empty">Aucune réponse enregistrée</div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Date</th><th>Formulaire</th><th>Rempli par</th><th></th></tr></thead>
          <tbody>
            {reponses.map(r => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString('fr-FR')}</td>
                <td>{r.formulaire_nom ?? '—'}</td>
                <td>{r.rempli_par_prenom ?? ''} {r.rempli_par_nom ?? ''}</td>
                <td><button className="btn-ghost btn-sm" onClick={() => setViewing(r)}><i className="bi bi-eye"></i> Voir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header"><h3>{viewing.formulaire_nom ?? 'Réponse'}</h3><button className="btn-icon" onClick={() => setViewing(null)}><i className="bi bi-x-lg"></i></button></div>
            <div className="modal-body">
              <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '1rem' }}>
                {new Date(viewing.createdAt).toLocaleString('fr-FR')} — {viewing.rempli_par_prenom ?? ''} {viewing.rempli_par_nom ?? ''}
              </p>
              <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.5rem 1rem', fontSize: '0.875rem' }}>
                {(viewing.schema?.fields ?? []).map(f => (
                  <>
                    <dt key={`l-${f.id}`} style={{ color: 'var(--cds-text-secondary)' }}>{f.label}</dt>
                    <dd key={`v-${f.id}`}>{formatValue(viewing.donnees?.[f.id])}</dd>
                  </>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  return String(v);
}