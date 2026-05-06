import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../App';
import api from '../services/api';

export default function ChangePassword() {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, login } = useContext(AuthContext);
  const navigate = useNavigate();

  const rules = [
    { ok: newPwd.length >= 8, label: 'Minimum 8 caractères' },
    { ok: /[A-Z]/.test(newPwd), label: 'Au moins 1 majuscule' },
    { ok: /[a-z]/.test(newPwd), label: 'Au moins 1 minuscule' },
    { ok: /[0-9]/.test(newPwd), label: 'Au moins 1 chiffre' },
    { ok: newPwd === confirmPwd && newPwd.length > 0, label: 'Les mots de passe correspondent' },
  ];
  const allValid = rules.every(r => r.ok);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid) return;
    setError(''); setLoading(true);
    try {
      await api.post('/auth/change-password', { old_password: oldPwd, new_password: newPwd });
      setSuccess(true);
      // Update user in context to remove must_change_password
      if (user) {
        const token = localStorage.getItem('token') || '';
        login({ ...user, must_change_password: false } as any, token);
      }
      setTimeout(() => navigate('/app'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du changement de mot de passe');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cds-ui-01)' }}>
      <div className="tile" style={{ padding: '2rem', width: '100%', maxWidth: '450px' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <i className="bi bi-shield-lock" style={{ fontSize: '2.5rem', color: 'var(--cds-interactive)' }}></i>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 400, marginTop: '0.5rem' }}>Changement de mot de passe</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>Vous devez changer votre mot de passe avant de continuer</p>
        </div>

        {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-circle"></i><span>{error}</span></div>}
        {success && <div className="notification notification-success mb-2"><i className="bi bi-check-circle"></i><span>Mot de passe modifié avec succès ! Redirection...</span></div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group"><label className="form-label">Mot de passe actuel</label><input type="password" className="form-input" value={oldPwd} onChange={e => setOldPwd(e.target.value)} required /></div>
          <div className="form-group"><label className="form-label">Nouveau mot de passe</label><input type="password" className="form-input" value={newPwd} onChange={e => setNewPwd(e.target.value)} required /></div>
          <div className="form-group"><label className="form-label">Confirmer le nouveau mot de passe</label><input type="password" className="form-input" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required /></div>

          <div style={{ background: 'var(--cds-field-01)', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.75rem' }}>
            {rules.map((r, i) => (
              <div key={i} style={{ color: r.ok ? 'var(--cds-support-success)' : 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
                {r.ok ? '✓' : '○'} {r.label}
              </div>
            ))}
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={!allValid || loading}>
            {loading ? 'Enregistrement...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}