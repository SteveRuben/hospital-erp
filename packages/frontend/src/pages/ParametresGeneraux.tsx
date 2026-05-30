import { useEffect, useState } from 'react';
import { useSnackbar } from '../components/Snackbar';
import api from '../services/api';

interface Setting { id: number; cle: string; valeur: string; description: string; categorie: string }

const CAT_LABELS: Record<string, string> = { general: 'Général', patients: 'Patients', lits: 'Lits', services: 'Services', securite: 'Sécurité' };

export default function ParametresGeneraux() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSetting, setEditSetting] = useState<{ cle: string; valeur: string } | null>(null);
  const { showSnackbar } = useSnackbar();

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try { const { data } = await api.get('/settings'); setSettings(data); }
    catch { showSnackbar('Erreur chargement paramètres', 'error'); }
    finally { setLoading(false); }
  };

  const saveSetting = async () => {
    if (!editSetting) return;
    try {
      await api.put(`/settings/${editSetting.cle}`, { valeur: editSetting.valeur });
      showSnackbar('Paramètre enregistré', 'success');
      setEditSetting(null);
      loadSettings();
    } catch { showSnackbar('Erreur', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const grouped = settings.reduce((acc, s) => {
    const cat = s.categorie || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {} as Record<string, Setting[]>);

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/configuration">Configuration</a><span className="breadcrumb-separator">/</span>
        <span>Paramètres généraux</span>
      </nav>
      <div className="page-header"><h1 className="page-title">Paramètres généraux</h1></div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="tile mb-2" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--cds-interactive)' }}>
            {CAT_LABELS[cat] || cat}
          </h3>
          <table className="data-table">
            <thead><tr><th>Paramètre</th><th>Valeur</th><th>Description</th><th></th></tr></thead>
            <tbody>
              {items.map(s => (
                <tr key={s.cle}>
                  <td className="fw-600" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{s.cle}</td>
                  <td>
                    {editSetting?.cle === s.cle ? (
                      <div className="d-flex gap-1">
                        <input type="text" className="form-input" value={editSetting.valeur} onChange={e => setEditSetting({ ...editSetting, valeur: e.target.value })} style={{ fontSize: '0.8125rem' }} />
                        <button className="btn-primary btn-sm" onClick={saveSetting}>✓</button>
                        <button className="btn-ghost btn-sm" onClick={() => setEditSetting(null)}>✗</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8125rem', maxWidth: '300px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.valeur}>{s.valeur}</span>
                    )}
                  </td>
                  <td className="text-muted" style={{ fontSize: '0.75rem', maxWidth: '250px' }}>{s.description}</td>
                  <td><button className="btn-icon" onClick={() => setEditSetting({ cle: s.cle, valeur: s.valeur })}><i className="bi bi-pencil"></i></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
