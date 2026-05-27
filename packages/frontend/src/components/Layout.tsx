import { NavLink, useNavigate } from 'react-router-dom';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App';
import { getMyHabilitations, getMenuConfig, getStockAlerts } from '../services/api';
import { useSnackbar } from './Snackbar';
import PatientSearch from './PatientSearch';
import LocaleSelector from './LocaleSelector';
import { useBranding } from './BrandingProvider';
import OnboardingWizard from './OnboardingWizard';
import NotificationsBell from './NotificationsBell';
import MentionHandleDialog from './MentionHandleDialog';

interface MenuItemDB { id: number; groupe: string; groupe_ordre: number; module: string; label: string; icon: string; path: string; ordre: number }

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, impersonating, stopImpersonate } = useContext(AuthContext);
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const { branding } = useBranding();
  const [menuGroups, setMenuGroups] = useState<Array<{ label: string; items: MenuItemDB[] }>>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHandleDialog, setShowHandleDialog] = useState(false);

  // Onboarding state is now per-admin in the DB (User.onboardingDismissedAt).
  // The wizard auto-pops if:
  //   - user is admin
  //   - the establishment still has its default name
  //   - the admin has never dismissed it, OR last dismissal is older than 7 days
  // The banner stays visible regardless of dismissal until the data is actually
  // filled in — it's the persistent re-entry point.
  const ONBOARDING_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
  const establishmentLooksDefault = branding.nom_etablissement === 'Hospital ERP' || branding.nom_etablissement === '';
  const dismissedAt = user?.onboarding_dismissed_at ? new Date(user.onboarding_dismissed_at).getTime() : 0;
  const recentlyDismissed = dismissedAt > 0 && (Date.now() - dismissedAt) < ONBOARDING_COOLDOWN_MS;
  const needsOnboarding = user?.role === 'admin' && establishmentLooksDefault && !recentlyDismissed;

  useEffect(() => {
    if (needsOnboarding) setShowOnboarding(true);
  }, [needsOnboarding]);

  useEffect(() => {
    if (user) {
      loadMenu();
      checkStockAlerts();
    }
  }, [user]);

  const checkStockAlerts = async () => {
    try {
      const { data } = await getStockAlerts();
      if (Array.isArray(data) && data.length > 0) {
        showSnackbar(`⚠️ ${data.length} médicament${data.length > 1 ? 's' : ''} en stock bas`, 'warning', 8000);
      }
    } catch { /* ignore if endpoint not available */ }
  };

  const loadMenu = async () => {
    try {
      const [habRes, menuRes] = await Promise.all([getMyHabilitations(), getMenuConfig()]);
      const allowedModules: string[] = habRes.data;
      const allItems: MenuItemDB[] = menuRes.data;

      // Filter by habilitations (admin sees all)
      const filtered = user?.role === 'admin' ? allItems : allItems.filter(i => allowedModules.includes(i.module));

      // Group by groupe
      const groups: Record<string, MenuItemDB[]> = {};
      const groupOrder: Record<string, number> = {};
      for (const item of filtered) {
        if (!groups[item.groupe]) { groups[item.groupe] = []; groupOrder[item.groupe] = item.groupe_ordre; }
        groups[item.groupe].push(item);
      }

      const sorted = Object.entries(groups)
        .sort(([a], [b]) => (groupOrder[a] || 0) - (groupOrder[b] || 0))
        .map(([label, items]) => ({ label, items: items.sort((a, b) => a.ordre - b.ordre) }));

      setMenuGroups(sorted);
    } catch (err) {
      console.error('Failed to load menu:', err);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  // Banner stays visible whenever the establishment is unconfigured AND the
  // wizard isn't currently open — gives admins a way back into the wizard
  // even after a dismissal.
  const onboardingPending = user?.role === 'admin' && establishmentLooksDefault && !showOnboarding;

  return (
    <>
      {showOnboarding && <OnboardingWizard onClose={() => setShowOnboarding(false)} />}
      {showHandleDialog && <MentionHandleDialog onClose={() => setShowHandleDialog(false)} />}

      {impersonating && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, background: '#da1e28', color: '#fff', padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', fontSize: '0.8125rem', fontWeight: 500 }}>
          <i className="bi bi-eye"></i>
          Vous visualisez en tant que <strong>{user?.prenom} {user?.nom}</strong> ({user?.role})
          <button onClick={stopImpersonate} style={{ background: '#fff', color: '#da1e28', border: 'none', padding: '0.25rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>← Revenir admin</button>
        </div>
      )}

      <header className="header" style={impersonating ? { top: '36px' } : {}}>
        <div className="header-logo">
          {branding.logo_url
            ? <img src={branding.logo_url} alt="" style={{ height: '24px', width: 'auto', objectFit: 'contain' }} />
            : <i className="bi bi-hospital"></i>}
          <span>{branding.nom_etablissement}</span>
        </div>
        <PatientSearch />
        <div className="header-actions">
          <LocaleSelector />
          <button title="Discussion équipe" onClick={() => navigate('/app/chat')}><i className="bi bi-chat-dots"></i></button>
          <NotificationsBell />
          <div className="header-user" onClick={() => setShowHandleDialog(true)} title={`@${user?.mention_handle || user?.username} — cliquez pour personnaliser`} style={{ cursor: 'pointer' }}>
            <i className="bi bi-person-circle"></i>
            <span>{user?.prenom} {user?.nom}</span>
            {user?.mention_handle && <span style={{ fontSize: '0.6875rem', color: '#8d8d8d', marginLeft: '0.25rem' }}>@{user.mention_handle}</span>}
          </div>
        </div>
      </header>

      <nav className="sidebar" style={impersonating ? { top: `calc(var(--cds-header-height) + 36px)` } : {}}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {menuGroups.map((group, gi) => (
            <div className="sidebar-group" key={gi}>
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map(item => (
                <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end={item.path === '/app'}>
                  <i className={`bi ${item.icon}`}></i>{item.label}
                </NavLink>
              ))}
              {gi < menuGroups.length - 1 && <div className="sidebar-divider"></div>}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="user-info"><div>{user?.prenom} {user?.nom}</div><div><span className="tag tag-blue">{user?.role}</span></div></div>
          <button className="btn-secondary" style={{ width: '100%', fontSize: '0.75rem' }} onClick={handleLogout}><i className="bi bi-box-arrow-right"></i> Déconnexion</button>
        </div>
      </nav>

      <main className="main-content" style={impersonating ? { marginTop: `calc(var(--cds-header-height) + 36px)` } : {}}>
        {onboardingPending && (
          <div style={{ background: 'var(--cds-support-info)', color: '#fff', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '1rem' }}>
            <span><i className="bi bi-info-circle" style={{ marginRight: '0.5rem' }}></i>Votre établissement n'est pas encore configuré.</span>
            <button onClick={() => setShowOnboarding(true)} style={{ background: '#fff', color: 'var(--cds-support-info)', border: 'none', padding: '0.25rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>Configurer maintenant</button>
          </div>
        )}
        {children}
      </main>
    </>
  );
}