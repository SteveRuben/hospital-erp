import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../App';
import { useSnackbar } from '../components/Snackbar';
import { updateMe } from '../services/api';
import MentionHandleDialog from '../components/MentionHandleDialog';

/**
 * Self-service profile page.
 *
 * Read-only fields (username, role) are admin-managed — changing your own
 * role from here would be a privilege escalation hole. Editable: full name
 * and phone. The MFA / @-handle / password actions sit in their dedicated
 * surfaces (toggle, modal, /change-password) and are linked from here so
 * everything personal is one click away from the header.
 */

export default function Profil() {
  const { user, login } = useContext(AuthContext);
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const [draft, setDraft] = useState({ nom: '', prenom: '', telephone: '' });
  const [saving, setSaving] = useState(false);
  const [showHandle, setShowHandle] = useState(false);

  useEffect(() => {
    if (user) setDraft({ nom: user.nom ?? '', prenom: user.prenom ?? '', telephone: user.telephone ?? '' });
  }, [user]);

  if (!user) return null;

  const dirty = draft.nom !== (user.nom ?? '') || draft.prenom !== (user.prenom ?? '') || draft.telephone !== (user.telephone ?? '');

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await updateMe(draft);
      const token = localStorage.getItem('token') || '';
      login({ ...user, ...data }, token);
      showSnackbar('Profil mis à jour', 'success');
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur', 'error');
    } finally { setSaving(false); }
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrateur', medecin: 'Médecin', comptable: 'Comptable',
    laborantin: 'Laborantin', reception: 'Réception', pharmacien: 'Pharmacien',
  };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Mon profil</span></nav>
      <div className="page-header"><h1 className="page-title">Mon profil</h1></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '1rem' }}>
        <div className="tile" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Informations personnelles</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Nom d'utilisateur</label>
              <input className="form-input" value={user.username} disabled />
              <div className="text-muted" style={{ fontSize: '0.6875rem', marginTop: '0.25rem' }}>Géré par un administrateur</div>
            </div>
            <div className="form-group">
              <label className="form-label">Rôle</label>
              <input className="form-input" value={roleLabels[user.role] ?? user.role} disabled />
            </div>
            <div className="form-group">
              <label className="form-label">Prénom</label>
              <input className="form-input" value={draft.prenom} onChange={e => setDraft({ ...draft, prenom: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Nom</label>
              <input className="form-input" value={draft.nom} onChange={e => setDraft({ ...draft, nom: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Téléphone</label>
              <input className="form-input" value={draft.telephone} onChange={e => setDraft({ ...draft, telephone: e.target.value })} />
            </div>
          </div>

          <button className="btn-primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>

        <div>
          <div className="tile mb-2" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}><i className="bi bi-at"></i> @-handle</h4>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
              Raccourci pour être mentionné : <strong>@{user.mention_handle || user.username}</strong>
            </p>
            <button className="btn-secondary btn-sm" onClick={() => setShowHandle(true)}><i className="bi bi-pencil"></i> Modifier</button>
          </div>

          <div className="tile mb-2" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}><i className="bi bi-key"></i> Mot de passe</h4>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
              Changez votre mot de passe régulièrement.
            </p>
            <button className="btn-secondary btn-sm" onClick={() => navigate('/change-password')}><i className="bi bi-shield-lock"></i> Changer le mot de passe</button>
          </div>

          <div className="tile" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}><i className="bi bi-shield-check"></i> Double authentification</h4>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
              {user.mfa_enabled ? 'Activée — votre compte est protégé par un code OTP.' : 'Non activée — recommandée pour renforcer la sécurité.'}
            </p>
            <button className="btn-secondary btn-sm" onClick={() => navigate('/app/securite')}>
              <i className={`bi ${user.mfa_enabled ? 'bi-shield-check' : 'bi-shield-plus'}`}></i> {user.mfa_enabled ? 'Gérer la MFA' : 'Configurer la MFA'}
            </button>
          </div>
        </div>
      </div>

      {showHandle && <MentionHandleDialog onClose={() => setShowHandle(false)} />}
    </div>
  );
}
