import { NavLink, useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../App';
import { getMenuForRole } from '../config/permissions';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, impersonating, stopImpersonate } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const menuGroups = user ? getMenuForRole(user.role) : [];

  return (
    <>
      {/* Impersonation banner */}
      {impersonating && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
          background: '#da1e28', color: '#fff', padding: '0.5rem 1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
          fontSize: '0.8125rem', fontWeight: 500,
        }}>
          <i className="bi bi-eye"></i>
          Vous visualisez l'application en tant que <strong>{user?.prenom} {user?.nom}</strong> ({user?.role})
          <button onClick={stopImpersonate} style={{ background: '#fff', color: '#da1e28', border: 'none', padding: '0.25rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
            ← Revenir admin
          </button>
        </div>
      )}

      {/* Header */}
      <header className="header" style={impersonating ? { top: '36px' } : {}}>
        <div className="header-logo">
          <i className="bi bi-hospital"></i>
          <span>Hospital ERP</span>
        </div>
        <div className="header-search">
          <i className="bi bi-search"></i>
          <input type="text" placeholder="Rechercher un patient..." />
        </div>
        <div className="header-actions">
          <button title="Notifications"><i className="bi bi-bell"></i></button>
          <div className="header-user">
            <i className="bi bi-person-circle"></i>
            <span>{user?.prenom} {user?.nom}</span>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <nav className="sidebar" style={impersonating ? { top: `calc(var(--cds-header-height) + 36px)` } : {}}>
        {menuGroups.map((group, gi) => (
          <div className="sidebar-group" key={gi}>
            <div className="sidebar-group-label">{group.label}</div>
            {group.items.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                end={item.path === '/app'}
              >
                <i className={`bi ${item.icon}`}></i>
                {item.label}
              </NavLink>
            ))}
            {gi < menuGroups.length - 1 && <div className="sidebar-divider"></div>}
          </div>
        ))}
        <div className="sidebar-footer">
          <div className="user-info">
            <div>{user?.prenom} {user?.nom}</div>
            <div><span className="tag tag-blue">{user?.role}</span></div>
          </div>
          <button className="btn-secondary" style={{ width: '100%', fontSize: '0.75rem' }} onClick={handleLogout}>
            <i className="bi bi-box-arrow-right"></i> Déconnexion
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content" style={impersonating ? { marginTop: `calc(var(--cds-header-height) + 36px)` } : {}}>
        {children}
      </main>
    </>
  );
}