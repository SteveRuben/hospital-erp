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
import Layout from './components/Layout';

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
            <Route path="/app/*" element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/patients" element={<Patients />} />
                    <Route path="/patients/:id" element={<PatientDetail />} />
                    <Route path="/medecins" element={<Medecins />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/consultations" element={<Consultations />} />
                    <Route path="/finances" element={<Finances />} />
                    <Route path="/laboratoire" element={<Laboratoire />} />
                    <Route path="/rendezvous" element={<RendezVous />} />
                    <Route path="/visites" element={<Visites />} />
                    <Route path="/file-attente" element={<FileAttente />} />
                    <Route path="/listes-patients" element={<ListesPatients />} />
                    <Route path="/documentation" element={<Documentation />} />
                    <Route path="/utilisateurs" element={<Utilisateurs />} />
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