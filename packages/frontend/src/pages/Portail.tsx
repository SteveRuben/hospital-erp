import { useState } from 'react';
import api from '../services/api';

type Step = 'login' | 'otp' | 'dashboard' | 'book';

export default function Portail() {
  const [step, setStep] = useState<Step>('login');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [patientName, setPatientName] = useState('');
  const [token, setToken] = useState('');
  const [patient, setPatient] = useState<any>(null);
  const [rdvs, setRdvs] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [medecins, setMedecins] = useState<any[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [bookForm, setBookForm] = useState({ service_id: '', medecin_id: '', date: '', time: '', motif: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const requestOtp = async () => {
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/portail/request-otp', { contact });
      setPatientName(data.patient_name);
      setStep('otp');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/portail/verify-otp', { contact, code });
      setToken(data.token); setPatient(data.patient);
      // Load RDVs
      const rdvRes = await api.get('/portail/mes-rdv', { headers: { Authorization: `Bearer ${data.token}` } });
      setRdvs(rdvRes.data);
      const srvRes = await api.get('/portail/services');
      setServices(srvRes.data);
      const medRes = await api.get('/portail/medecins');
      setMedecins(medRes.data);
      setStep('dashboard');
    } catch (err: any) { setError(err.response?.data?.error || 'Code incorrect'); }
    finally { setLoading(false); }
  };

  const loadSlots = async (date: string) => {
    setBookForm({ ...bookForm, date, time: '' });
    try {
      const { data } = await api.get('/portail/creneaux', { params: { date, service_id: bookForm.service_id || undefined } });
      setSlots(data);
    } catch { setSlots([]); }
  };

  const bookRdv = async () => {
    if (!bookForm.date || !bookForm.time) { setError('Date et heure requises'); return; }
    setError(''); setLoading(true);
    try {
      const date_rdv = `${bookForm.date}T${bookForm.time}:00`;
      await api.post('/portail/rdv', { service_id: bookForm.service_id || null, medecin_id: bookForm.medecin_id || null, date_rdv, motif: bookForm.motif }, { headers: { Authorization: `Bearer ${token}` } });
      setSuccess('Rendez-vous confirmé !');
      // Reload
      const rdvRes = await api.get('/portail/mes-rdv', { headers: { Authorization: `Bearer ${token}` } });
      setRdvs(rdvRes.data);
      setTimeout(() => { setStep('dashboard'); setSuccess(''); setBookForm({ service_id: '', medecin_id: '', date: '', time: '', motif: '' }); }, 2000);
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
    finally { setLoading(false); }
  };

  const statutConfig: Record<string, { label: string; color: string }> = {
    planifie: { label: 'Planifié', color: '#6f6f6f' }, confirme: { label: 'Confirmé', color: '#0f62fe' },
    en_cours: { label: 'En cours', color: '#f1c21b' }, termine: { label: 'Terminé', color: '#198038' },
    annule: { label: 'Annulé', color: '#da1e28' }, absent: { label: 'Absent', color: '#8a3800' },
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f4', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Header */}
      <header style={{ background: '#161616', color: '#fff', padding: '0.75rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><i className="bi bi-hospital" style={{ color: '#0f62fe' }}></i><span style={{ fontWeight: 600 }}>Hospital ERP</span><span style={{ color: '#6f6f6f', marginLeft: '0.5rem' }}>Portail Patient</span></div>
        {patient && <span style={{ fontSize: '0.8125rem', color: '#c6c6c6' }}>{patient.prenom} {patient.nom}</span>}
      </header>

      <div style={{ maxWidth: '700px', margin: '2rem auto', padding: '0 1rem' }}>
        {/* Step: Login */}
        {step === 'login' && (
          <div style={{ background: '#fff', padding: '2rem', border: '1px solid #e0e0e0' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <i className="bi bi-calendar-check" style={{ fontSize: '2.5rem', color: '#0f62fe' }}></i>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 300, marginTop: '0.5rem' }}>Prise de rendez-vous en ligne</h1>
              <p style={{ color: '#525252', fontSize: '0.875rem' }}>Entrez votre numéro de téléphone ou email pour accéder à vos rendez-vous</p>
            </div>
            {error && <div style={{ background: '#ffd7d9', borderLeft: '3px solid #da1e28', padding: '0.5rem 0.75rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>{error}</div>}
            <div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', fontSize: '0.75rem', color: '#525252', marginBottom: '0.5rem' }}>Téléphone ou email</label><input type="text" value={contact} onChange={e => setContact(e.target.value)} placeholder="+243 XXX XXX XXX ou email@exemple.com" style={{ width: '100%', padding: '0.6875rem 1rem', border: 'none', borderBottom: '1px solid #8d8d8d', background: '#f4f4f4', fontSize: '0.875rem', boxSizing: 'border-box' }} /></div>
            <button onClick={requestOtp} disabled={!contact || loading} style={{ width: '100%', padding: '0.75rem', background: '#0f62fe', color: '#fff', border: 'none', fontSize: '0.875rem', cursor: 'pointer' }}>{loading ? 'Envoi...' : 'Recevoir un code de vérification'}</button>
          </div>
        )}

        {/* Step: OTP */}
        {step === 'otp' && (
          <div style={{ background: '#fff', padding: '2rem', border: '1px solid #e0e0e0' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <i className="bi bi-shield-lock" style={{ fontSize: '2rem', color: '#0f62fe' }}></i>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 400 }}>Vérification</h2>
              <p style={{ color: '#525252', fontSize: '0.8125rem' }}>Bonjour {patientName}, un code a été envoyé à {contact}</p>
            </div>
            {error && <div style={{ background: '#ffd7d9', borderLeft: '3px solid #da1e28', padding: '0.5rem 0.75rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>{error}</div>}
            <div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', fontSize: '0.75rem', color: '#525252', marginBottom: '0.5rem' }}>Code à 6 chiffres</label><input type="text" value={code} onChange={e => setCode(e.target.value)} maxLength={6} placeholder="000000" style={{ width: '100%', padding: '0.6875rem 1rem', border: 'none', borderBottom: '1px solid #8d8d8d', background: '#f4f4f4', fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.5rem', boxSizing: 'border-box' }} /></div>
            <button onClick={verifyOtp} disabled={code.length !== 6 || loading} style={{ width: '100%', padding: '0.75rem', background: '#0f62fe', color: '#fff', border: 'none', fontSize: '0.875rem', cursor: 'pointer' }}>{loading ? 'Vérification...' : 'Vérifier'}</button>
            <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.75rem', color: '#525252' }}>Code de test (console serveur) — En production, envoyé par SMS/email</p>
          </div>
        )}

        {/* Step: Dashboard */}
        {step === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 400 }}>Mes rendez-vous</h2>
              <button onClick={() => setStep('book')} style={{ background: '#0f62fe', color: '#fff', border: 'none', padding: '0.625rem 1.25rem', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><i className="bi bi-plus"></i> Nouveau RDV</button>
            </div>
            {rdvs.length === 0 ? (
              <div style={{ background: '#fff', padding: '3rem', textAlign: 'center', border: '1px solid #e0e0e0' }}>
                <i className="bi bi-calendar-x" style={{ fontSize: '2.5rem', color: '#a8a8a8' }}></i>
                <p style={{ color: '#525252', marginTop: '0.75rem' }}>Aucun rendez-vous</p>
              </div>
            ) : (
              <div>
                {rdvs.map((r: any) => (
                  <div key={r.id} style={{ background: '#fff', border: '1px solid #e0e0e0', padding: '1rem 1.25rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{new Date(r.date_rdv).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                      <div style={{ fontSize: '0.8125rem', color: '#525252' }}>{new Date(r.date_rdv).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — {r.service_nom || 'Consultation'} {r.medecin_nom ? `• Dr. ${r.medecin_prenom} ${r.medecin_nom}` : ''}</div>
                      {r.motif && <div style={{ fontSize: '0.75rem', color: '#6f6f6f', marginTop: '0.25rem' }}>{r.motif}</div>}
                    </div>
                    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: '0.75rem', background: `${statutConfig[r.statut]?.color}20`, color: statutConfig[r.statut]?.color }}>{statutConfig[r.statut]?.label || r.statut}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step: Book */}
        {step === 'book' && (
          <div style={{ background: '#fff', padding: '2rem', border: '1px solid #e0e0e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 400 }}>Nouveau rendez-vous</h2>
              <button onClick={() => setStep('dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#525252' }}>← Retour</button>
            </div>
            {error && <div style={{ background: '#ffd7d9', borderLeft: '3px solid #da1e28', padding: '0.5rem 0.75rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>{error}</div>}
            {success && <div style={{ background: '#defbe6', borderLeft: '3px solid #198038', padding: '0.5rem 0.75rem', marginBottom: '1rem', fontSize: '0.8125rem', color: '#198038' }}>{success}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div><label style={{ display: 'block', fontSize: '0.75rem', color: '#525252', marginBottom: '0.5rem' }}>Service</label><select value={bookForm.service_id} onChange={e => setBookForm({...bookForm, service_id: e.target.value})} style={{ width: '100%', padding: '0.6875rem', border: 'none', borderBottom: '1px solid #8d8d8d', background: '#f4f4f4', fontSize: '0.875rem' }}><option value="">Sélectionner...</option>{services.map((s: any) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
              <div><label style={{ display: 'block', fontSize: '0.75rem', color: '#525252', marginBottom: '0.5rem' }}>Médecin (optionnel)</label><select value={bookForm.medecin_id} onChange={e => setBookForm({...bookForm, medecin_id: e.target.value})} style={{ width: '100%', padding: '0.6875rem', border: 'none', borderBottom: '1px solid #8d8d8d', background: '#f4f4f4', fontSize: '0.875rem' }}><option value="">Pas de préférence</option>{medecins.map((m: any) => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom} — {m.specialite}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', fontSize: '0.75rem', color: '#525252', marginBottom: '0.5rem' }}>Date</label><input type="date" value={bookForm.date} onChange={e => loadSlots(e.target.value)} min={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '0.6875rem', border: 'none', borderBottom: '1px solid #8d8d8d', background: '#f4f4f4', fontSize: '0.875rem', boxSizing: 'border-box' }} /></div>
            {bookForm.date && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#525252', marginBottom: '0.5rem' }}>Créneau horaire</label>
                {slots.length === 0 ? <p style={{ color: '#6f6f6f', fontSize: '0.8125rem' }}>Aucun créneau disponible pour cette date</p> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {slots.map(s => (
                      <button key={s} onClick={() => setBookForm({...bookForm, time: s})} style={{ padding: '0.5rem 1rem', border: bookForm.time === s ? '2px solid #0f62fe' : '1px solid #e0e0e0', background: bookForm.time === s ? '#edf5ff' : '#fff', cursor: 'pointer', fontSize: '0.875rem', color: bookForm.time === s ? '#0f62fe' : '#161616' }}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', fontSize: '0.75rem', color: '#525252', marginBottom: '0.5rem' }}>Motif (optionnel)</label><input type="text" value={bookForm.motif} onChange={e => setBookForm({...bookForm, motif: e.target.value})} placeholder="ex: Consultation de suivi" style={{ width: '100%', padding: '0.6875rem 1rem', border: 'none', borderBottom: '1px solid #8d8d8d', background: '#f4f4f4', fontSize: '0.875rem', boxSizing: 'border-box' }} /></div>
            <button onClick={bookRdv} disabled={!bookForm.date || !bookForm.time || loading} style={{ width: '100%', padding: '0.75rem', background: '#0f62fe', color: '#fff', border: 'none', fontSize: '0.875rem', cursor: 'pointer' }}>{loading ? 'Réservation...' : 'Confirmer le rendez-vous'}</button>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.75rem', color: '#6f6f6f' }}>Hospital ERP — Portail Patient</p>
      </div>
    </div>
  );
}