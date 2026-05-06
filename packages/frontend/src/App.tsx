import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import type { User } from './types';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import Medecins from './pages/Medecins';
import Services from './pages/Services';
import Consultations from './pages/Consultations';
import Finances from './pages/Finances';
import Laboratoire from './pages/Laboratoire';
import RendezVous from './pages/RendezVous';
import Visites from './pages/Visites';
import FileAttente from './pages/FileAttente';
import ListesPatients from './pages/ListesPatients';
import Documentation from './pages/Documentation';
import Utilisateurs from './pages/Utilisateurs';
import Import from './pages/Import';
import Habilitations from './pages/Habilitations';
import Lits from './pages/Lits';
import Programmes from './pages/Programmes';
import Facturation from './pages/Facturation';
import ChangePassword from './pages/ChangePassword';
import Recherche from './pages/Recherche';
import PaiementMobile from './pages/PaiementMobile';
import Portail from './pages/Portail';
import Imagerie from './pages/Imagerie';
import Concepts from './pages/Concepts';
import Orders from './pages/Orders';
import Pharmacie from './pages/Pharmacie';
import PatientMerge from './pages/PatientMerge';
import Rapports from './pages/Rapports';
import Layout from './components/Layout';
import RoleGuard from './components/RoleGuard';

interface AuthContextType {
  user: User | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  loading: boolean;
  impersonating: boolean;
  originalAdminId: number | null;
  startImpersonate: (user: User, token: string, adminId: number) => void;
  stopImpersonate: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null, login: () => {}, logout: () => {}, loading: true,
  impersonating: false, originalAdminId: null, startImpersonate: () => {}, stopImpersonate: () => {},
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function SessionManager({ children }: { children: React.ReactNode }) {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleTimeout = useCallback(() => {
    logout();
    navigate('/login?expired=1');
  }, [logout, navigate]);

  useSessionTimeout(handleTimeout, !!user);

  return (
    <>
      {children}
      {/* Session warning banner */}
      <div
        id="session-warning"
        style={{
          display: 'none',
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: '#ffc107', color: '#161616',
          padding: '0.75rem 1.5rem',
          alignItems: 'center', justifyContent: 'center', gap: '1rem',
          fontSize: '0.875rem', fontWeight: 500,
        }}
      >
        <i className="bi bi-exclamation-triangle"></i>
        Votre session expire dans 30 secondes. Bougez la souris ou cliquez pour rester connecté.
      </div>
    </>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(false);
  const [originalAdminId, setOriginalAdminId] = useState<number | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    const adminId = localStorage.getItem('impersonating_admin_id');
    if (storedUser && token) setUser(JSON.parse(storedUser));
    if (adminId) { setImpersonating(true); setOriginalAdminId(Number(adminId)); }
    setLoading(false);
  }, []);

  const login = (userData: User, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('impersonating_admin_id');
    setUser(null);
    setImpersonating(false);
    setOriginalAdminId(null);
  }, []);

  const startImpersonate = (userData: User, token: string, adminId: number) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('impersonating_admin_id', String(adminId));
    setUser(userData);
    setImpersonating(true);
    setOriginalAdminId(adminId);
  };

  const stopImpersonateFn = useCallback(async () => {
    if (!originalAdminId) return;
    try {
      const { stopImpersonate: stopApi } = await import('./services/api');
      const { data } = await stopApi(originalAdminId);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.removeItem('impersonating_admin_id');
      setUser(data.user);
      setImpersonating(false);
      setOriginalAdminId(null);
    } catch (err) { console.error(err); }
  }, [originalAdminId]);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, impersonating, originalAdminId, startImpersonate, stopImpersonate: stopImpersonateFn }}>
      <BrowserRouter>
        <SessionManager>
          <Routes>
            <Route path="/" element={user ? <Navigate to="/app" /> : <Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/portail" element={<Portail />} />
            <Route path="/app/*" element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/recherche" element={<Recherche />} />
                    <Route path="/patients" element={<RoleGuard roles={['admin','medecin','reception']}><Patients /></RoleGuard>} />
                    <Route path="/patients/:id" element={<RoleGuard roles={['admin','medecin','reception']}><PatientDetail /></RoleGuard>} />
                    <Route path="/medecins" element={<RoleGuard roles={['admin','medecin']}><Medecins /></RoleGuard>} />
                    <Route path="/services" element={<RoleGuard roles={['admin']}><Services /></RoleGuard>} />
                    <Route path="/consultations" element={<RoleGuard roles={['admin','medecin']}><Consultations /></RoleGuard>} />
                    <Route path="/finances" element={<RoleGuard roles={['admin','comptable']}><Finances /></RoleGuard>} />
                    <Route path="/laboratoire" element={<RoleGuard roles={['admin','laborantin']}><Laboratoire /></RoleGuard>} />
                    <Route path="/rendezvous" element={<RoleGuard roles={['admin','medecin','reception']}><RendezVous /></RoleGuard>} />
                    <Route path="/visites" element={<RoleGuard roles={['admin','medecin','reception']}><Visites /></RoleGuard>} />
                    <Route path="/file-attente" element={<RoleGuard roles={['admin','medecin','reception']}><FileAttente /></RoleGuard>} />
                    <Route path="/listes-patients" element={<RoleGuard roles={['admin','medecin']}><ListesPatients /></RoleGuard>} />
                    <Route path="/documentation" element={<Documentation />} />
                    <Route path="/utilisateurs" element={<RoleGuard roles={['admin']}><Utilisateurs /></RoleGuard>} />
                    <Route path="/habilitations" element={<RoleGuard roles={['admin']}><Habilitations /></RoleGuard>} />
                    <Route path="/import" element={<RoleGuard roles={['admin']}><Import /></RoleGuard>} />
                    <Route path="/lits" element={<RoleGuard roles={['admin','medecin']}><Lits /></RoleGuard>} />
                    <Route path="/programmes" element={<RoleGuard roles={['admin','medecin']}><Programmes /></RoleGuard>} />
                    <Route path="/facturation" element={<RoleGuard roles={['admin','comptable']}><Facturation /></RoleGuard>} />
                    <Route path="/paiement-mobile" element={<RoleGuard roles={['admin','comptable']}><PaiementMobile /></RoleGuard>} />
                    <Route path="/imagerie" element={<RoleGuard roles={['admin','medecin']}><Imagerie /></RoleGuard>} />
                    <Route path="/concepts" element={<RoleGuard roles={['admin']}><Concepts /></RoleGuard>} />
                    <Route path="/orders" element={<RoleGuard roles={['admin','medecin','laborantin']}><Orders /></RoleGuard>} />
                    <Route path="/pharmacie" element={<RoleGuard roles={['admin','medecin']}><Pharmacie /></RoleGuard>} />
                    <Route path="/patient-merge" element={<RoleGuard roles={['admin']}><PatientMerge /></RoleGuard>} />
                    <Route path="/rapports" element={<RoleGuard roles={['admin','comptable']}><Rapports /></RoleGuard>} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            } />
          </Routes>
        </SessionManager>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;