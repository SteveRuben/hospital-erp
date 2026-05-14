import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../components/Snackbar';
import api from '../services/api';

interface Setting { id: number; cle: string; valeur: string; description: string; categorie: string }
interface RefItem { id: number; categorie: string; code: string; libelle: string; actif: boolean; par_defaut: boolean; ordre: number; parent_code: string | null }

const CATEGORIES = [
  { code: 'pays', label: 'Pays', icon: 'bi-globe' },
  { code: 'ville', label: 'Villes', icon: 'bi-geo-alt' },
  { code: 'pavillon', label: 'Pavillons', icon: 'bi-hospital' },
  { code: 'service', label: 'Types de service', icon: 'bi-building', redirect: '/app/services', hint: 'Géré dans Services (avec prix et sous-services)' },
  { code: 'specialite', label: 'Spécialités médicales', icon: 'bi-heart-pulse' },
  { code: 'mode_paiement', label: 'Modes de paiement', icon: 'bi-cash' },
  { code: 'type_examen', label: 'Types d\'examen labo', icon: 'bi-flask' },
  { code: 'type_programme', label: 'Types de programme', icon: 'bi-heart-pulse' },
  { code: 'concept_classe', label: 'Classes de concept', icon: 'bi-book-half' },
  { code: 'medicaments', label: 'Médicaments (import)', icon: 'bi-capsule' },
];

export default function Configuration() {
  const [tab, setTab] = useState<'settings' | 'lists'>('settings');
  const [settings, setSettings] = useState<Setting[]>([]);
  const navigate = useNavigate();
  const [selectedCat, setSelectedCat] = useState('pays');
  const [items, setItems] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSetting, setEditSetting] = useState<{ cle: string; valeur: string } | null>(null);
  const [newItem, setNewItem] = useState({ code: '', libelle: '', parent_code: '' });
  const [showImport, setShowImport] = useState(false);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const { showSnackbar } = useSnackbar();

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => { if (tab === 'lists') { loadItems(); setSelectedParent(null); } }, [selectedCat, tab]);

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

  const handleImportMedicaments = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post('/pharmacie/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showSnackbar(`${data.imported} médicaments importés`, 'success');
      setShowImport(false);
    } catch { showSnackbar('Erreur d\'import médicaments', 'error'); }
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
              <div key={cat.code} onClick={() => { if ((cat as any).redirect) { navigate((cat as any).redirect); } else { setSelectedCat(cat.code); } }} style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderRadius: '4px', marginBottom: '0.25rem', background: selectedCat === cat.code ? 'var(--cds-interactive)' : 'transparent', color: selectedCat === cat.code ? '#fff' : 'inherit', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className={`bi ${cat.icon}`}></i> {cat.label}
                {(cat as any).redirect && <i className="bi bi-box-arrow-up-right" style={{ fontSize: '0.625rem', marginLeft: 'auto' }}></i>}
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
              <div className="notification notification-info mb-2" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem' }}>
                  {selectedCat === 'medicaments'
                    ? 'Format CSV médicaments : nom;dci;forme;dosage;categorie;prix;code_barre'
                    : 'Format CSV : code;libelle;parent_code;ordre'}
                </span>
                <input type="file" accept=".csv,.txt" onChange={selectedCat === 'medicaments' ? handleImportMedicaments : handleImport} style={{ fontSize: '0.75rem' }} />
              </div>
            )}

            {selectedCat === 'medicaments' ? (
              <MedicamentsSection onImport={() => setShowImport(true)} />
            ) : (
              <RefListSection items={items} selectedParent={selectedParent} setSelectedParent={setSelectedParent} newItem={newItem} setNewItem={setNewItem} addItem={addItem} toggleItem={toggleItem} setDefault={setDefault} deleteItem={deleteItem} loadItems={loadItems} selectedCat={selectedCat} showSnackbar={showSnackbar} />
            )}
          </div>

        </div>
      )}
    </div>
  );
}


// Medicaments section (import only)
function MedicamentsSection({ onImport }: { onImport: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <i className="bi bi-capsule" style={{ fontSize: '3rem', color: 'var(--cds-interactive)', display: 'block', marginBottom: '1rem' }}></i>
      <h4 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Import de médicaments</h4>
      <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>Importez vos médicaments via un fichier CSV.</p>
      <p style={{ fontSize: '0.75rem', background: 'var(--cds-ui-01)', padding: '0.75rem', borderRadius: '4px', fontFamily: 'monospace', marginBottom: '1rem' }}>
        Format : nom;dci;forme;dosage;categorie;prix;code_barre
      </p>
      <div className="d-flex gap-1" style={{ justifyContent: 'center' }}>
        <button className="btn-primary" onClick={onImport}><i className="bi bi-upload"></i> Importer CSV</button>
        <a href="/app/pharmacie" className="btn-secondary"><i className="bi bi-capsule"></i> Pharmacie</a>
      </div>
    </div>
  );
}

// Reference list section with parent/child hierarchy
function RefListSection({ items, selectedParent, setSelectedParent, newItem, setNewItem, addItem, toggleItem, setDefault, deleteItem, loadItems, selectedCat, showSnackbar }: {
  items: RefItem[]; selectedParent: string | null; setSelectedParent: (v: string | null) => void;
  newItem: { code: string; libelle: string; parent_code: string }; setNewItem: (v: any) => void;
  addItem: () => void; toggleItem: (code: string) => void; setDefault: (code: string) => void;
  deleteItem: (code: string) => void; loadItems: () => void; selectedCat: string; showSnackbar: (msg: string, type: any) => void;
}) {
  // For "ville", parents come from "pays" category
  const crossCategoryParents: Record<string, string> = { ville: 'pays' };
  const parentCategory = crossCategoryParents[selectedCat];

  const [externalParents, setExternalParents] = useState<RefItem[]>([]);

  useEffect(() => {
    if (parentCategory) {
      api.get(`/reference-lists/${parentCategory}`).then(({ data }) => setExternalParents(data)).catch(() => {});
    }
  }, [parentCategory]);

  // Determine parents: either from same category (no parent_code) or from external category
  const parents = parentCategory ? externalParents : items.filter(i => !i.parent_code);
  const childrenOf = (parentCode: string) => items.filter(i => i.parent_code === parentCode);

  // For categories without hierarchy (no parents, no children), show flat list
  const hasHierarchy = parentCategory || items.some(i => !!i.parent_code) || items.some(i => !i.parent_code && items.some(c => c.parent_code === i.code));
  const flatItems = !hasHierarchy ? items : [];

  const [newChild, setNewChild] = useState({ code: '', libelle: '' });

  const addChild = async () => {
    if (!selectedParent || !newChild.code || !newChild.libelle) { showSnackbar('Code et libellé requis', 'warning'); return; }
    try {
      await api.post(`/reference-lists/${selectedCat}`, { code: newChild.code.toUpperCase(), libelle: newChild.libelle, parent_code: selectedParent });
      showSnackbar('Élément ajouté', 'success');
      setNewChild({ code: '', libelle: '' });
      loadItems();
    } catch (err: any) { showSnackbar(err.response?.data?.error || 'Erreur', 'error'); }
  };

  // Flat list (no hierarchy — e.g. modes de paiement, spécialités without sub-types)
  if (!hasHierarchy && flatItems.length >= 0) {
    return (
      <div>
        <div className="d-flex gap-1 mb-2" style={{ padding: '0.75rem', background: 'var(--cds-ui-01)', borderRadius: '4px' }}>
          <input type="text" className="form-input" value={newItem.code} onChange={e => setNewItem({ ...newItem, code: e.target.value.toUpperCase(), parent_code: '' })} placeholder="Code" style={{ width: '120px', fontSize: '0.8125rem' }} />
          <input type="text" className="form-input" value={newItem.libelle} onChange={e => setNewItem({ ...newItem, libelle: e.target.value, parent_code: '' })} placeholder="Libellé" style={{ flex: 1, fontSize: '0.8125rem' }} />
          <button className="btn-primary btn-sm" onClick={addItem}><i className="bi bi-plus"></i> Ajouter</button>
        </div>
        <table className="data-table" style={{ fontSize: '0.8125rem' }}>
          <thead><tr><th>Code</th><th>Libellé</th><th>Actif</th><th>Défaut</th><th></th></tr></thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{ opacity: item.actif ? 1 : 0.5 }}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.6875rem' }}>{item.code}</td>
                <td>{item.libelle}</td>
                <td><button className={`btn-ghost btn-sm ${item.actif ? 'text-success' : 'text-danger'}`} onClick={() => toggleItem(item.code)} style={{ fontSize: '0.6875rem' }}>{item.actif ? '✓ Actif' : '✗ Inactif'}</button></td>
                <td>{item.par_defaut ? <span className="tag tag-blue" style={{ fontSize: '0.5625rem' }}>Défaut</span> : <button className="btn-ghost btn-sm" onClick={() => setDefault(item.code)} style={{ fontSize: '0.625rem' }}>Définir</button>}</td>
                <td><button className="btn-icon" onClick={() => deleteItem(item.code)}><i className="bi bi-trash"></i></button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="table-empty">Aucun élément</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      {/* Add new item — for cross-category (ville), show parent selector */}
      {parentCategory ? (
        <div className="d-flex gap-1 mb-2" style={{ padding: '0.75rem', background: 'var(--cds-ui-01)', borderRadius: '4px' }}>
          <select className="form-select" value={newItem.parent_code} onChange={e => setNewItem({ ...newItem, parent_code: e.target.value })} style={{ width: '150px', fontSize: '0.8125rem' }}>
            <option value="">— Pays —</option>
            {externalParents.map(p => <option key={p.code} value={p.code}>{p.libelle}</option>)}
          </select>
          <input type="text" className="form-input" value={newItem.code} onChange={e => setNewItem({ ...newItem, code: e.target.value.toUpperCase() })} placeholder="Code ville" style={{ width: '80px', fontSize: '0.8125rem' }} />
          <input type="text" className="form-input" value={newItem.libelle} onChange={e => setNewItem({ ...newItem, libelle: e.target.value })} placeholder="Nom de la ville" style={{ flex: 1, fontSize: '0.8125rem' }} />
          <button className="btn-primary btn-sm" onClick={addItem}><i className="bi bi-plus"></i> Ajouter</button>
        </div>
      ) : (
        <div className="d-flex gap-1 mb-2" style={{ padding: '0.75rem', background: 'var(--cds-ui-01)', borderRadius: '4px' }}>
          <input type="text" className="form-input" value={newItem.code} onChange={e => setNewItem({ ...newItem, code: e.target.value.toUpperCase(), parent_code: '' })} placeholder="Code" style={{ width: '120px', fontSize: '0.8125rem' }} />
          <input type="text" className="form-input" value={newItem.libelle} onChange={e => setNewItem({ ...newItem, libelle: e.target.value, parent_code: '' })} placeholder="Libellé du type principal" style={{ flex: 1, fontSize: '0.8125rem' }} />
          <button className="btn-primary btn-sm" onClick={addItem}><i className="bi bi-plus"></i> Ajouter type</button>
        </div>
      )}

      {/* Parents list */}
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {parents.map(parent => {
          const children = childrenOf(parent.code);
          const isSelected = selectedParent === parent.code;
          return (
            <div key={parent.id} className="tile" style={{ padding: 0, border: isSelected ? '2px solid var(--cds-interactive)' : '1px solid var(--cds-ui-03)', opacity: parent.actif ? 1 : 0.5 }}>
              {/* Parent row */}
              <div onClick={() => setSelectedParent(isSelected ? null : parent.code)} style={{ padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isSelected ? 'var(--cds-ui-01)' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <i className={`bi ${isSelected ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ fontSize: '0.75rem' }}></i>
                  <span style={{ fontWeight: 600 }}>{parent.libelle}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>{parent.code}</span>
                  {children.length > 0 && <span className="tag tag-gray" style={{ fontSize: '0.625rem' }}>{children.length} sous-type{children.length > 1 ? 's' : ''}</span>}
                </div>
                <div className="d-flex gap-1" onClick={e => e.stopPropagation()}>
                  <button className={`btn-ghost btn-sm ${parent.actif ? 'text-success' : 'text-danger'}`} onClick={() => toggleItem(parent.code)} style={{ fontSize: '0.6875rem' }}>
                    {parent.actif ? '✓' : '✗'}
                  </button>
                  <button className="btn-icon" onClick={() => deleteItem(parent.code)} style={{ fontSize: '0.75rem' }}><i className="bi bi-trash"></i></button>
                </div>
              </div>

              {/* Children table (visible when parent is selected) */}
              {isSelected && (
                <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--cds-ui-03)', background: 'var(--cds-ui-01)' }}>
                  {/* Add child form */}
                  <div className="d-flex gap-1 mb-1" style={{ fontSize: '0.8125rem' }}>
                    <input type="text" className="form-input" value={newChild.code} onChange={e => setNewChild({ ...newChild, code: e.target.value.toUpperCase() })} placeholder="Code sous-type" style={{ width: '120px', fontSize: '0.75rem' }} />
                    <input type="text" className="form-input" value={newChild.libelle} onChange={e => setNewChild({ ...newChild, libelle: e.target.value })} placeholder="Libellé du sous-type" style={{ flex: 1, fontSize: '0.75rem' }} />
                    <button className="btn-primary btn-sm" onClick={addChild} style={{ fontSize: '0.75rem' }}><i className="bi bi-plus"></i> Ajouter</button>
                  </div>

                  {/* Children list */}
                  {children.length > 0 ? (
                    <table className="data-table" style={{ fontSize: '0.8125rem' }}>
                      <thead><tr><th>Code</th><th>Libellé</th><th>Actif</th><th>Défaut</th><th></th></tr></thead>
                      <tbody>
                        {children.map(child => (
                          <tr key={child.id} style={{ opacity: child.actif ? 1 : 0.5 }}>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.6875rem' }}>{child.code}</td>
                            <td>{child.libelle}</td>
                            <td>
                              <button className={`btn-ghost btn-sm ${child.actif ? 'text-success' : 'text-danger'}`} onClick={() => toggleItem(child.code)} style={{ fontSize: '0.6875rem' }}>
                                {child.actif ? '✓ Actif' : '✗ Inactif'}
                              </button>
                            </td>
                            <td>
                              {child.par_defaut ? <span className="tag tag-blue" style={{ fontSize: '0.5625rem' }}>Défaut</span> : (
                                <button className="btn-ghost btn-sm" onClick={() => setDefault(child.code)} style={{ fontSize: '0.625rem' }}>Définir</button>
                              )}
                            </td>
                            <td><button className="btn-icon" onClick={() => deleteItem(child.code)} style={{ fontSize: '0.75rem' }}><i className="bi bi-trash"></i></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-muted" style={{ fontSize: '0.75rem', textAlign: 'center', padding: '0.5rem' }}>Aucun sous-type. Ajoutez-en un ci-dessus.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {parents.length === 0 && <div className="table-empty">Aucun élément. Ajoutez un type principal ci-dessus.</div>}
      </div>
    </div>
  );
}
