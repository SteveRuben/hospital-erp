import { useState, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../App';
import { login as loginApi } from '../services/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await loginApi({ username, password });
      login(data.user, data.token);
      if (data.user.must_change_password) {
        navigate('/change-password');
      } else {
        // Redirect to saved path (if session expired while on a page)
        const redirectPath = sessionStorage.getItem('redirect_after_login');
        sessionStorage.removeItem('redirect_after_login');
        navigate(redirectPath || '/app');
      }
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <i className="bi bi-hospital" style={{ fontSize: '2.5rem', color: 'var(--cds-interactive)' }}></i>
          <h1>Hospital ERP</h1>
          <p className="subtitle">Connectez-vous à votre compte</p>
        </div>

        {sessionExpired && <div className="notification notification-warning mb-2"><i className="bi bi-clock-history"></i><span>Session expirée pour inactivité. Veuillez vous reconnecter.</span></div>}
        {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-circle"></i><span>{error}</span></div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nom d'utilisateur</label>
            <input type="text" className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input type="password" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
          {/* Compte par défaut: admin / admin123 */}
        </p>
      </div>
    </div>
  );
}