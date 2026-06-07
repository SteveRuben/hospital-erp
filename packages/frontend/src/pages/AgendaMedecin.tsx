import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getMedecin, getMedecinAgenda, saveMedecinDisponibilites,
  addMedecinException, deleteMedecinException,
  type DispoSlot, type AgendaException,
} from '../services/api';
import { useSnackbar } from '../components/Snackbar';

// 0=dimanche … 6=samedi (convention Date.getDay()). Affichés lundi → dimanche.
const JOURS: { value: number; label: string }[] = [
  { value: 1, label: 'Lundi' }, { value: 2, label: 'Mardi' }, { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' }, { value: 5, label: 'Vendredi' }, { value: 6, label: 'Samedi' },
  { value: 0, label: 'Dimanche' },
];

export default function AgendaMedecin() {
  const { id } = useParams();
  const medecinId = Number(id);
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();

  const [medecinNom, setMedecinNom] = useState('');
  const [slots, setSlots] = useState<DispoSlot[]>([]);
  const [exceptions, setExceptions] = useState<AgendaException[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exForm, setExForm] = useState({ date: '', type: 'absence' as 'absence' | 'presence', heure_debut: '', heure_fin: '', motif: '' });

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    try {
      const [m, a] = await Promise.all([getMedecin(medecinId), getMedecinAgenda(medecinId)]);
      const md = m.data as any;
      setMedecinNom(`${md.prenom ?? ''} ${md.nom ?? ''}`.trim());
      setSlots(a.data.disponibilites);
      setExceptions(a.data.exceptions);
    } catch { showSnackbar('Erreur de chargement de l\'agenda', 'error'); }
    finally { setLoading(false); }
  };

  const addSlot = (jour: number) => setSlots(s => [...s, { jour_semaine: jour, heure_debut: '09:00', heure_fin: '17:00' }]);
  const removeSlot = (idx: number) => setSlots(s => s.filter((_, i) => i !== idx));
  const updateSlot = (idx: number, field: 'heure_debut' | 'heure_fin', value: string) =>
    setSlots(s => s.map((sl, i) => i === idx ? { ...sl, [field]: value } : sl));

  const saveDispos = async () => {
    setSaving(true);
    try {
      await saveMedecinDisponibilites(medecinId, slots);
      showSnackbar('Disponibilités enregistrées', 'success');
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur', 'error');
    } finally { setSaving(false); }
  };

  const addException = async () => {
    if (!exForm.date) { showSnackbar('Date requise', 'warning'); return; }
    try {
      await addMedecinException(medecinId, {
        date: exForm.date, type: exForm.type,
        heure_debut: exForm.heure_debut || undefined,
        heure_fin: exForm.heure_fin || undefined,
        motif: exForm.motif || undefined,
      });
      setExForm({ date: '', type: 'absence', heure_debut: '', heure_fin: '', motif: '' });
      load();
    } catch (err: any) { showSnackbar(err.response?.data?.error || 'Erreur', 'error'); }
  };

  const removeException = async (exId: number) => {
    try { await deleteMedecinException(medecinId, exId); load(); }
    catch { showSnackbar('Erreur', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/medecins">Médecins</a><span className="breadcrumb-separator">/</span>
        <span>Agenda</span>
      </nav>
      <div className="page-header">
        <h1 className="page-title">Agenda — Dr {medecinNom}</h1>
        <button className="btn-secondary" onClick={() => navigate('/app/medecins')}>Retour</button>
      </div>

      <div className="tile mb-3" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Disponibilités hebdomadaires</h3>
        <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>
          Plages de présence récurrentes. Un RDV en dehors de ces heures sera refusé (sauf présence exceptionnelle ci-dessous).
        </p>
        {JOURS.map(j => {
          const dayIdx = slots.map((s, i) => ({ s, i })).filter(x => x.s.jour_semaine === j.value);
          return (
            <div key={j.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid var(--cds-ui-03)' }}>
              <div style={{ width: '90px', fontWeight: 600, fontSize: '0.8125rem', paddingTop: '0.375rem' }}>{j.label}</div>
              <div style={{ flex: 1 }}>
                {dayIdx.length === 0 && <span className="text-muted" style={{ fontSize: '0.75rem' }}>Absent</span>}
                {dayIdx.map(({ s, i }) => (
                  <div key={i} className="d-flex gap-1" style={{ alignItems: 'center', marginBottom: '0.375rem' }}>
                    <input type="time" className="form-input" style={{ width: '120px' }} value={s.heure_debut} onChange={e => updateSlot(i, 'heure_debut', e.target.value)} />
                    <span>—</span>
                    <input type="time" className="form-input" style={{ width: '120px' }} value={s.heure_fin} onChange={e => updateSlot(i, 'heure_fin', e.target.value)} />
                    <button className="btn-icon" title="Retirer" onClick={() => removeSlot(i)}><i className="bi bi-x-lg"></i></button>
                  </div>
                ))}
                <button className="btn-ghost btn-sm" onClick={() => addSlot(j.value)}><i className="bi bi-plus"></i> Ajouter une plage</button>
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <button className="btn-primary" onClick={saveDispos} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer les disponibilités'}</button>
        </div>
      </div>

      <div className="tile" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Exceptions datées</h3>
        <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>
          Absence ponctuelle (congé) ou présence exceptionnelle un jour donné. Prime sur l'agenda hebdomadaire.
        </p>
        <div className="d-flex gap-1 mb-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Date</label>
            <input type="date" className="form-input" value={exForm.date} onChange={e => setExForm({ ...exForm, date: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Type</label>
            <select className="form-select" value={exForm.type} onChange={e => setExForm({ ...exForm, type: e.target.value as 'absence' | 'presence' })}>
              <option value="absence">Absence</option>
              <option value="presence">Présence exceptionnelle</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">De (optionnel)</label>
            <input type="time" className="form-input" style={{ width: '120px' }} value={exForm.heure_debut} onChange={e => setExForm({ ...exForm, heure_debut: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">À (optionnel)</label>
            <input type="time" className="form-input" style={{ width: '120px' }} value={exForm.heure_fin} onChange={e => setExForm({ ...exForm, heure_fin: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '150px' }}>
            <label className="form-label">Motif (optionnel)</label>
            <input type="text" className="form-input" value={exForm.motif} onChange={e => setExForm({ ...exForm, motif: e.target.value })} placeholder="Congé, formation…" />
          </div>
          <button className="btn-primary" onClick={addException}><i className="bi bi-plus"></i> Ajouter</button>
        </div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Type</th><th>Heures</th><th>Motif</th><th></th></tr></thead>
          <tbody>
            {exceptions.map(e => (
              <tr key={e.id}>
                <td>{new Date(e.date).toLocaleDateString('fr-FR')}</td>
                <td><span className={`tag ${e.type === 'absence' ? 'tag-red' : 'tag-green'}`}>{e.type === 'absence' ? 'Absence' : 'Présence'}</span></td>
                <td>{e.heure_debut && e.heure_fin ? `${e.heure_debut}–${e.heure_fin}` : 'Journée'}</td>
                <td>{e.motif || '-'}</td>
                <td><button className="btn-icon" onClick={() => removeException(e.id)}><i className="bi bi-trash"></i></button></td>
              </tr>
            ))}
            {exceptions.length === 0 && <tr><td colSpan={5} className="table-empty">Aucune exception</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
