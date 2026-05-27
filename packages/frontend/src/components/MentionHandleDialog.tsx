import { useState, useContext } from 'react';
import { AuthContext } from '../App';
import { useSnackbar } from './Snackbar';
import { setMyMentionHandle } from '../services/api';

/**
 * Small modal where a user picks their custom @-handle.
 *
 * When set, the handle becomes an alternate way to be @-mentioned (in
 * notes, chat messages, etc.) in addition to the login `username`. The
 * displayed name in chips stays prenom+nom — the handle is just a typing
 * shortcut for whoever's writing the mention.
 *
 * Validation:
 *   - 2-50 chars, [a-zA-Z0-9._-]
 *   - case-insensitive uniqueness enforced by the DB partial unique index
 *
 * Clear (empty input) removes the custom handle, falling back to username.
 */

interface Props { onClose: () => void }

export default function MentionHandleDialog({ onClose }: Props) {
  const { user, login } = useContext(AuthContext);
  const { showSnackbar } = useSnackbar();
  const [value, setValue] = useState(user?.mention_handle ?? '');
  const [saving, setSaving] = useState(false);
  const HANDLE_RE = /^[a-zA-Z0-9._-]{2,50}$/;

  const handleSave = async () => {
    const v = value.trim();
    if (v.length > 0 && !HANDLE_RE.test(v)) {
      showSnackbar('2 à 50 caractères, lettres/chiffres/._- uniquement', 'warning');
      return;
    }
    setSaving(true);
    try {
      const { data } = await setMyMentionHandle(v.length === 0 ? null : v);
      if (user) {
        const token = localStorage.getItem('token') || '';
        login({ ...user, mention_handle: data.mention_handle }, token);
      }
      showSnackbar(data.mention_handle ? `@-handle défini : @${data.mention_handle}` : '@-handle retiré', 'success');
      onClose();
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Mon @-handle</h3><button className="btn-icon" onClick={onClose}><i className="bi bi-x-lg"></i></button></div>
        <div className="modal-body">
          <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>
            Définissez un raccourci court pour être mentionné facilement par vos collègues
            (ex: <code>@kano</code> au lieu de <code>@{user?.username}</code>). Votre nom complet
            reste affiché — le handle n'est qu'une commodité de frappe.
          </p>
          <div className="form-group">
            <label className="form-label">Votre @-handle</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ color: 'var(--cds-text-secondary)', fontWeight: 600 }}>@</span>
              <input
                type="text"
                className="form-input"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={user?.username}
                maxLength={50}
                autoFocus
              />
            </div>
            <div className="text-muted" style={{ fontSize: '0.6875rem', marginTop: '0.25rem' }}>
              Vide = utiliser <code>@{user?.username}</code> par défaut.
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  );
}
