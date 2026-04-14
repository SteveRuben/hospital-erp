import { useState, useEffect } from 'react';
import { getHabilitations, updateHabilitation, getMenuConfig, updateMenuItem } from '../services/api';

const allRoles = [
  { role: 'admin', label: 'Admin', tag: 'tag-red' },
  { role: 'medecin', label: 'Médecin', tag: 'tag-blue' },
  { role: 'comptable', label: 'Comptable', tag: 'tag-green' },
  { role: 'laborantin', label: 'Laborantin', tag: 'tag-purple' },
  { role: 'reception', label: 'Réception', tag: 'tag-orange' },
];

interface Hab { id: number; role: string; module: string; acces: boolean }
interface MenuItem { id: number; groupe: string; groupe_ordre: number; module: string; label: string; icon: string; path: string; ordre: number; actif: boolean }

export default function Habilitations() {
  const [tab, setTab] = useState<'permissions' | 'menu' | 'resume'>('permissions');
  const [habs, setHabs] = useState<Hab[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [h, m] = await Promise.all([getHabilitations(), getMenuConfig()]);
      setHabs(h.data); setMenuItems(m.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const toggleAccess = async (role: string, module: string, current: boolean) => {
    setSaving(`${role}-${module}`);
    try {
      await updateHabilitation({ role, module, acces: !current });
      setHabs(prev => prev.map(h => h.role === role && h.module === module ? { ...h, acces: !current } : h));
    } catch { alert('Erreur'); }
    finally { setSaving(''); }
  };

  const getAccess = (role: string, module: string): boolean => {
    const h = habs.find(h => h.role === role && h.module === module);
    return h ? h.acces : false;
  };

  const modules = [...new Set(habs.map(h => h.module))];

  const moveItem = async (item: MenuItem, direction: 'up' | 'down') => {
    const sameGroup = menuItems.filter(m => m.groupe === item.groupe).sort((a, b) => a.ordre - b.ordre);
    const idx = sameGroup.findIndex(m => m.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameGroup.length) return;

    const newOrder1 = sameGroup[swapIdx].ordre;
    const newOrder2 = item.ordre;

    try {
      await updateMenuItem(item.id, { ...item, ordre: newOrder1 });
      await updateMenuItem(sameGroup[swapIdx].id, { ...sameGroup[swapIdx], ordre: newOrder2 });
      loadData();
    } catch { alert('Erreur'); }
  };

  const toggleMenuItem = async (item: MenuItem) => {
    try {
      await updateMenuItem(item.id, { ...item, actif: !item.actif });
      loadData();
    } catch { alert('Erreur'); }
  };

  const updateLabel = async (item: MenuItem, newLabel: string) => {
    try {
      await updateMenuItem(item.id, { ...item, label: newLabel });
      loadData();
    } catch { alert('Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const groupedMenu = menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
    if (!acc[item.groupe]) acc[item.groupe] = [];
    acc[item.groupe].push(item);
    return acc;
  }, {});

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Habilitations</span></nav>
      <div className="page-header"><h1 className="page-title">Habilitations & Menu</h1></div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'permissions' ? 'active' : ''}`} onClick={() => setTab('permissions')}>Permissions par rôle</button>
        <button className={`tab-item ${tab === 'menu' ? 'active' : ''}`} onClick={() => setTab('menu')}>Organisation du menu</button>
        <button className={`tab-item ${tab === 'resume' ? 'active' : ''}`} onClick={() => setTab('resume')}>Résumé par rôle</button>
      </div>

      {tab === 'permissions' && (
        <div>
          <div className="notification notification-info mb-2"><i className="bi bi-info-circle"></i><span>Cliquez sur une case pour activer/désactiver l'accès. Les changements sont sauvegardés immédiatement.</span></div>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Module</th>
                {allRoles.map(r => <th key={r.role} style={{ textAlign: 'center', width: '120px' }}><span className={`tag ${r.tag}`}>{r.label}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {modules.map(mod => (
                <tr key={mod}>
                  <td style={{ fontWeight: 500 }}>{mod}</td>
                  {allRoles.map(r => {
                    const hasAccess = getAccess(r.role, mod);
                    const isSaving = saving === `${r.role}-${mod}`;
                    const isAdmin = r.role === 'admin';
                    return (
                      <td key={r.role} style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => !isAdmin && toggleAccess(r.role, mod, hasAccess)}
                          disabled={isAdmin || isSaving}
                          style={{
                            background: 'none', border: 'none', cursor: isAdmin ? 'not-allowed' : 'pointer',
                            fontSize: '1.25rem', padding: '0.25rem 0.5rem',
                            color: hasAccess ? 'var(--cds-support-success)' : 'var(--cds-ui-04)',
                            opacity: isSaving ? 0.5 : 1,
                          }}
                          title={isAdmin ? 'Admin a toujours accès' : `Cliquer pour ${hasAccess ? 'retirer' : 'donner'} l'accès`}
                        >
                          {hasAccess ? '✓' : '—'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'menu' && (
        <div>
          <div className="notification notification-info mb-2"><i className="bi bi-info-circle"></i><span>Réorganisez les éléments du menu, renommez-les ou désactivez-les. Les changements sont appliqués immédiatement pour tous les utilisateurs.</span></div>
          {Object.entries(groupedMenu).sort(([,a], [,b]) => (a[0]?.groupe_ordre || 0) - (b[0]?.groupe_ordre || 0)).map(([groupe, items]) => (
            <div key={groupe} className="tile mb-2" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.16px' }}>{groupe}</h3>
              {items.sort((a, b) => a.ordre - b.ordre).map((item, idx) => (
                <div key={item.id} className="d-flex align-center gap-2" style={{ padding: '0.5rem 0', borderBottom: idx < items.length - 1 ? '1px solid var(--cds-ui-03)' : 'none', opacity: item.actif ? 1 : 0.4 }}>
                  <div className="d-flex" style={{ flexDirection: 'column', gap: '0.125rem' }}>
                    <button className="btn-icon" onClick={() => moveItem(item, 'up')} disabled={idx === 0} style={{ padding: '0.125rem' }}><i className="bi bi-chevron-up" style={{ fontSize: '0.75rem' }}></i></button>
                    <button className="btn-icon" onClick={() => moveItem(item, 'down')} disabled={idx === items.length - 1} style={{ padding: '0.125rem' }}><i className="bi bi-chevron-down" style={{ fontSize: '0.75rem' }}></i></button>
                  </div>
                  <i className={`bi ${item.icon}`} style={{ fontSize: '1rem', width: '1.5rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}></i>
                  <input type="text" defaultValue={item.label} onBlur={e => { if (e.target.value !== item.label) updateLabel(item, e.target.value); }} className="form-input" style={{ flex: 1, padding: '0.375rem 0.5rem', fontSize: '0.875rem' }} />
                  <span className="text-muted" style={{ fontSize: '0.6875rem', width: '120px' }}>{item.path}</span>
                  <button className={item.actif ? 'btn-ghost btn-sm' : 'btn-ghost btn-sm text-danger'} onClick={() => toggleMenuItem(item)} style={{ fontSize: '0.75rem' }}>
                    {item.actif ? 'Actif ✓' : 'Inactif'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'resume' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            {allRoles.map(r => {
              const roleModules = modules.filter(m => getAccess(r.role, m));
              const apiDesc: Record<string, string> = {
                admin: 'Toutes les routes API sans restriction',
                medecin: 'CRUD patients, consultations, prescriptions, vitaux, allergies, pathologies, vaccinations, RDV',
                comptable: 'Recettes, dépenses, factures, tarifs, paiements, bilan',
                laborantin: 'CRUD examens, résultats labo, workflow Kanban',
                reception: 'Création patients, RDV, file d\'attente, visites',
              };
              return (
                <div className="tile" key={r.role} style={{ padding: '1.25rem' }}>
                  <div className="d-flex align-center gap-1 mb-1">
                    <span className={`tag ${r.tag}`}>{r.label}</span>
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>{roleModules.length} modules</span>
                  </div>
                  <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem', fontSize: '0.8125rem' }}>
                    {roleModules.map(m => <li key={m} style={{ marginBottom: '0.25rem' }}>{m}</li>)}
                  </ul>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)', borderTop: '1px solid var(--cds-ui-03)', paddingTop: '0.5rem' }}>
                    <strong>Accès API :</strong> {apiDesc[r.role] || 'Non défini'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}