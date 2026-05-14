import { useState, useEffect } from 'react';
import { useSnackbar } from '../components/Snackbar';
import api from '../services/api';

interface Setting { id: number; cle: string; valeur: string; description: string; categorie: string }
interface RefItem { id: number; categorie: string; code: string; libelle: string; actif: boolean; par_defaut: boolean; ordre: number; parent_code: string | null }

const CATEGORIES = [
  { code: 'pays', label: 'Pays', icon: 'bi-globe' },
  { code: 'ville', label: 'Villes', icon: 'bi-geo-alt' },
  { code: 'pavillon', label: 'Pavillons', icon: 'bi-hospital' },
  { code: 'service', label: 'Services / Types de visite', icon: 'bi-building' },
  { code: 'specialite', label: 'Spécialités médicales', icon: 'bi-heart-pulse' },
  { code: 'mode_paiement', label: 'Modes de paiement', icon: 'bi-cash' },
  { code: 'type_examen', label: 'Types d\'examen labo', icon: 'bi-flask' },
  { code: 'type_programme', label: 'Types de programme', icon: 'bi-heart-pulse' },
  { code: 'concept_classe', label: 'Classes de concept', icon: 'bi-book-half' },
];

export default function Configuration() {
  const [tab, setTab] = useState<'settings' | 'lists'>('settings');
  const [settings, setSettings] = useState<Setting[]>([]);
  const [selectedCat, setSelectedCat] = useState('pays');
  const [items, setItems] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSetting, setEditSetting] = useState<{ cle: string; valeur: string } | null>(null);
  const [newItem, setNewItem] = useState({ code: '', libelle: '', parent_code: '' });
  const [showImport, setShowImport] = useState(false);
  const { showSnackbar } = useSnackbar();

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => { if (tab === 'lists') loadItems(); }, [selectedCat, tab]);

  const loadSettings = async () => {
    try { const { data } = await api.get('/settings'); setSettings(data); }
    catch { showSnackbar('Erreur chargement paramètres', 'error'); }
    finally { setLoading(false); }
  };

  const loadItems = async () => {
    try { const { data } = await api.get(`/reference-lists/${selectedCat}?all=true`); setItems(data); }
    catch { setItems([]); }
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

  const addItem = async () => {
    if (!newItem.code || !newItem.libelle) { showSnackbar('Code et libellé requis', 'warning'); return; }
    try {
      await api.post(`/reference-lists/${selectedCat}`, newItem);
      showSnackbar('Élément ajouté', 'success');
      setNewItem({ code: '', libelle: '', parent_code: '' });
      loadItems();
    } catch (err: any) { showSnackbar(err.response?.data?.error || 'Erreur', 'error'); }
  };

  const toggleItem = async (code: string) => {
    try {
      await api.patch(`/reference-lists/${selectedCat}/${code}/toggle`);
      loadItems();
    } catch { showSnackbar('Erreur', 'error'); }
  };

  const setDefault = async (code: string) => {
    try {
      await api.put(`/reference-lists/${selectedCat}/${code}`, { par_defaut: true });
      showSnackbar('Valeur par défaut mise à jour', 'success');
      loadItems();
    } catch { showSnackbar('Erreur', 'error'); }
  };

  const deleteItem = async (code: string) => {
    try {
      await api.delete(`/reference-lists/${selectedCat}/${code}`);
      showSnackbar('Supprimé', 'success');
      loadItems();
    } catch { showSnackbar('Erreur', 'error'); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post(`/reference-lists/${selectedCat}/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showSnackbar(`${data.imported} éléments importés`, 'success');
      setShowImport(false);
      loadItems();
    } catch { showSnackbar('Erreur d\'import', 'error'); }
    e.target.value = '';
  };

  const exportCsv = () => {
    window.open(`/api/reference-lists/${selectedCat}/export`, '_blank');
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const settingsByCategory = settings.reduce((acc, s) => {
    const cat = s.categorie || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {} as Record<string, Setting[]>);

  const catLabels: Record<string, string> = { general: 'Général', patients: 'Patients', lits: 'Lits', services: 'Services', securite: 'Sécurité' };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Configuration</span></nav>
      <div className="page-header"><h1 className="page-title">Configuration</h1></div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Paramètres généraux</button>
        <button className={`tab-item ${tab === 'lists' ? 'active' : ''}`} onClick={() => setTab('lists')}>Listes de référence</button>
      </div>

      {tab === 'settings' && (
        <div>
          {Object.entries(settingsByCategory).map(([cat, items]) => (
            <div key={cat} className="tile mb-2" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--cds-interactive)' }}>
                {catLabels[cat] || cat}
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
      )}

      {tab === 'lists' && (
        <div className="grid-sidebar">
          {/* Sidebar — categories */}
          <div className="tile" style={{ padding: '1rem' }}>
            <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--cds-text-secondary)' }}>Catégories</h4>
            {CATEGORIES.map(cat => (
              <div key={cat.code} onClick={() => setSelectedCat(cat.code)} style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderRadius: '4px', marginBottom: '0.25rem', background: selectedCat === cat.code ? 'var(--cds-interactive)' : 'transparent', color: selectedCat === cat.code ? '#fff' : 'inherit', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className={`bi ${cat.icon}`}></i> {cat.label}
              </div>
            ))}
          </div>

          {/* Main — items list */}
          <div className="tile" style={{ padding: '1.5rem' }}>
            <div className="d-flex justify-between align-center mb-2">
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{CATEGORIES.find(c => c.code === selectedCat)?.label}</h3>
              <div className="d-flex gap-1">
                <button className="btn-ghost btn-sm" onClick={exportCsv}><i className="bi bi-download"></i> Export</button>
                <button className="btn-ghost btn-sm" onClick={() => setShowImport(!showImport)}><i className="bi bi-upload"></i> Import CSV</button>
              </div>
            </div>

            {showImport && (
              <div className="notification notification-info mb-2" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem' }}>Format CSV : <code>code;libelle;parent_code;ordre</code></span>
                <input type="file" accept=".csv,.txt" onChange={handleImport} style={{ fontSize: '0.75rem' }} />
              </div>
            )}

            {/* Add new item */}
            <div className="d-flex gap-1 mb-2" style={{ padding: '0.75rem', background: 'var(--cds-ui-01)', borderRadius: '4px' }}>
              <input type="text" className="form-input" value={newItem.code} onChange={e => setNewItem({ ...newItem, code: e.target.value.toUpperCase() })} placeholder="Code" style={{ width: '100px', fontSize: '0.8125rem' }} />
              <input type="text" className="form-input" value={newItem.libelle} onChange={e => setNewItem({ ...newItem, libelle: e.target.value })} placeholder="Libellé" style={{ flex: 1, fontSize: '0.8125rem' }} />
              <input type="text" className="form-input" value={newItem.parent_code} onChange={e => setNewItem({ ...newItem, parent_code: e.target.value })} placeholder="Parent (opt.)" style={{ width: '100px', fontSize: '0.8125rem' }} />
              <button className="btn-primary btn-sm" onClick={addItem}><i className="bi bi-plus"></i> Ajouter</button>
            </div>

            {/* Items table */}
            <table className="data-table">
              <thead><tr><th>Code</th><th>Libellé</th><th>Parent</th><th>Actif</th><th>Défaut</th><th></th></tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} style={{ opacity: item.actif ? 1 : 0.5 }}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{item.code}</td>
                    <td>{item.libelle}</td>
                    <td className="text-muted" style={{ fontSize: '0.75rem' }}>{item.parent_code || '-'}</td>
                    <td>
                      <button className={`btn-ghost btn-sm ${item.actif ? 'text-success' : 'text-danger'}`} onClick={() => toggleItem(item.code)}>
                        {item.actif ? '✓ Actif' : '✗ Inactif'}
                      </button>
                    </td>
                    <td>
                      {item.par_defaut ? <span className="tag tag-blue">Défaut</span> : (
                        <button className="btn-ghost btn-sm" onClick={() => setDefault(item.code)} style={{ fontSize: '0.6875rem' }}>Définir</button>
                      )}
                    </td>
                    <td><button className="btn-icon" onClick={() => deleteItem(item.code)} title="Supprimer"><i className="bi bi-trash"></i></button></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="table-empty">Aucun élément dans cette catégorie</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
