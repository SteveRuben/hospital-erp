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
import Layout from './components/Layout';

interface AuthContextType {
  user: User | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType>({
  user: null, login: () => {}, logout: () => {}, loading: true
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

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (storedUser && token) setUser(JSON.parse(storedUser));
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
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
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