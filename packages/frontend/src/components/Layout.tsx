import { NavLink, useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../App';

const menuGroups = [
  {
    label: 'Accueil',
    items: [{ path: '/app', icon: 'bi-speedometer2', label: 'Dashboard' }],
  },
  {
    label: 'Clinique',
    items: [
      { path: '/app/patients', icon: 'bi-people', label: 'Patients' },
      { path: '/app/medecins', icon: 'bi-person-badge', label: 'Médecins' },
      { path: '/app/consultations', icon: 'bi-clipboard-pulse', label: 'Consultations' },
      { path: '/app/rendezvous', icon: 'bi-calendar-event', label: 'Rendez-vous' },
      { path: '/app/laboratoire', icon: 'bi-flask', label: 'Laboratoire' },
      { path: '/app/visites', icon: 'bi-door-open', label: 'Visites actives' },
      { path: '/app/file-attente', icon: 'bi-hourglass-split', label: "File d'attente" },
    ],
  },
  {
    label: 'Administration',
    items: [
      { path: '/app/finances', icon: 'bi-cash-coin', label: 'Finances' },
      { path: '/app/services', icon: 'bi-building', label: 'Services' },
      { path: '/app/listes-patients', icon: 'bi-list-ul', label: 'Listes patients' },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <>
      {/* Header */}
      <header className="header">
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
      <nav className="sidebar">
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
      <main className="main-content">
        {children}
      </main>
    </>
  );
}