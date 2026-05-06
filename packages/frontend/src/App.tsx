import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext, useCallback, lazy, Suspense } from 'react';
import type { User } from './types';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import Layout from './components/Layout';
import RoleGuard from './components/RoleGuard';

// Lazy load all pages for code splitting
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const Portail = lazy(() => import('./pages/Portail'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Patients = lazy(() => import('./pages/Patients'));
const PatientDetail = lazy(() => import('./pages/PatientDetail'));
const Medecins = lazy(() => import('./pages/Medecins'));
const Services = lazy(() => import('./pages/Services'));
const Consultations = lazy(() => import('./pages/Consultations'));
const Finances = lazy(() => import('./pages/Finances'));
const Laboratoire = lazy(() => import('./pages/Laboratoire'));
const RendezVous = lazy(() => import('./pages/RendezVous'));
const Visites = lazy(() => import('./pages/Visites'));
const FileAttente = lazy(() => import('./pages/FileAttente'));
const ListesPatients = lazy(() => import('./pages/ListesPatients'));
const Documentation = lazy(() => import('./pages/Documentation'));
const Utilisateurs = lazy(() => import('./pages/Utilisateurs'));
const Import = lazy(() => import('./pages/Import'));
const Habilitations = lazy(() => import('./pages/Habilitations'));
const Lits = lazy(() => import('./pages/Lits'));
const Programmes = lazy(() => import('./pages/Programmes'));
const Facturation = lazy(() => import('./pages/Facturation'));
const Recherche = lazy(() => import('./pages/Recherche'));
const PaiementMobile = lazy(() => import('./pages/PaiementMobile'));
const Imagerie = lazy(() => import('./pages/Imagerie'));
const Concepts = lazy(() => import('./pages/Concepts'));
const Orders = lazy(() => import('./pages/Orders'));
const Pharmacie = lazy(() => import('./pages/Pharmacie'));
const PatientMerge = lazy(() => import('./pages/PatientMerge'));
const Rapports = lazy(() => import('./pages/Rapports'));
const FormBuilder = lazy(() => import('./pages/FormBuilder'));
const CohortBuilder = lazy(() => import('./pages/CohortBuilder'));
const ContentPackages = lazy(() => import('./pages/ContentPackages'));

const PageLoader = () => <div className="loading"><div className="spinner"></div></div>;

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
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function SessionManager({ children }: { children: React.ReactNode }) {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const handleTimeout = useCallback(() => { logout(); navigate('/login?expired=1'); }, [logout, navigate]);
  useSessionTimeout(handleTimeout, !!user);
  return (
    <>
      {children}
      <div id="session-warning" style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999, background: '#ffc107', color: '#161616', padding: '0.75rem 1.5rem', alignItems: 'center', justifyContent: 'center', gap: '1rem', fontSize: '0.875rem', fontWeight: 500 }}>
        <i className="bi bi-exclamation-triangle"></i> Votre session expire dans 30 secondes.
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

  const login = (userData: User, token: string) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(userData)); setUser(userData); };
  const logout = useCallback(() => { localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('impersonating_admin_id'); setUser(null); setImpersonating(false); setOriginalAdminId(null); }, []);
  const startImpersonate = (userData: User, token: string, adminId: number) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(userData)); localStorage.setItem('impersonating_admin_id', String(adminId)); setUser(userData); setImpersonating(true); setOriginalAdminId(adminId); };
  const stopImpersonateFn = useCallback(async () => {
    if (!originalAdminId) return;
    try { const { stopImpersonate: stopApi } = await import('./services/api'); const { data } = await stopApi(originalAdminId); localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); localStorage.removeItem('impersonating_admin_id'); setUser(data.user); setImpersonating(false); setOriginalAdminId(null); } catch (err) { console.error(err); }
  }, [originalAdminId]);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, impersonating, originalAdminId, startImpersonate, stopImpersonate: stopImpersonateFn }}>
      <BrowserRouter>
        <SessionManager>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={user ? <Navigate to="/app" /> : <Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/portail" element={<Portail />} />
              <Route path="/app/*" element={
                <ProtectedRoute>
                  <Layout>
                    <Suspense fallback={<PageLoader />}>
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
                        <Route path="/formulaires" element={<RoleGuard roles={['admin']}><FormBuilder /></RoleGuard>} />
                        <Route path="/cohort-builder" element={<RoleGuard roles={['admin','medecin']}><CohortBuilder /></RoleGuard>} />
                        <Route path="/content-packages" element={<RoleGuard roles={['admin']}><ContentPackages /></RoleGuard>} />
                      </Routes>
                    </Suspense>
                  </Layout>
                </ProtectedRoute>
              } />
            </Routes>
          </Suspense>
        </SessionManager>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;