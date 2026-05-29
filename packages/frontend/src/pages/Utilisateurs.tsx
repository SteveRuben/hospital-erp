import { useState, useEffect, useContext } from 'react';
import { getUsers, createUser, impersonateUser, adminResetPassword, adminSuspendUser, adminUnsuspendUser, getUserAuditLog, type UserAuditEntry } from '../services/api';
import { AuthContext } from '../App';
import { useSnackbar } from '../components/Snackbar';
import { useConfirm } from '../components/ConfirmDialog';
import type { User } from '../types';

interface AdminUser extends User { suspended?: boolean; suspended_at?: string | null; created_at?: string }

const roleConfig: Record<string, { label: string; tag: string; desc: string }> = {
  admin: { label: 'Administrateur', tag: 'tag-red', desc: 'Accès complet à tous les modules' },
  medecin: { label: 'Médecin', tag: 'tag-blue', desc: 'Patients, consultations, prescriptions' },
  comptable: { label: 'Comptable', tag: 'tag-green', desc: 'Finances, facturation' },
  laborantin: { label: 'Laborantin', tag: 'tag-purple', desc: 'Module laboratoire' },
  reception: { label: 'Réception', tag: 'tag-orange', desc: 'Patients, RDV, file d\'attente' },
  pharmacien: { label: 'Pharmacien', tag: 'tag-teal', desc: 'Pharmacie, stock, dispensations' },
};

const emptyForm = { username: '', password: '', role: 'reception' as string, nom: '', prenom: '', telephone: '' };

export default function Utilisateurs() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const { user: currentUser, startImpersonate } = useContext(AuthContext);
  const { showSnackbar } = useSnackbar();
  const { confirm } = useConfirm();
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [activityTarget, setActivityTarget] = useState<AdminUser | null>(null);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try { const { data } = await getUsers(); setUsers(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await createUser(form);
      setShowModal(false);
      setForm(emptyForm);
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de la création');
    }
  };

  const countByRole = (role: string) => users.filter(u => u.role === role).length;

  const handleImpersonate = async (userId: number) => {
    if (!currentUser) return;
    try {
      const { data } = await impersonateUser(userId);
      startImpersonate(data.user, data.token, currentUser.id);
    } catch (err: any) { showSnackbar(err.response?.data?.error || 'Erreur', 'error'); }
  };

  const handleSuspendToggle = async (u: AdminUser) => {
    const action = u.suspended ? 'réactiver' : 'suspendre';
    const ok = await confirm({
      title: u.suspended ? 'Réactiver le compte' : 'Suspendre le compte',
      message: u.suspended
        ? `Le compte de ${u.prenom} ${u.nom} pourra à nouveau se connecter.`
        : `Le compte de ${u.prenom} ${u.nom} ne pourra plus se connecter et ses sessions seront invalidées.`,
      confirmLabel: u.suspended ? 'Réactiver' : 'Suspendre',
      variant: u.suspended ? 'warning' : 'danger',
    });
    if (!ok) return;
    try {
      if (u.suspended) await adminUnsuspendUser(u.id);
      else await adminSuspendUser(u.id);
      showSnackbar(`Compte ${action === 'suspendre' ? 'suspendu' : 'réactivé'}`, 'success');
      loadUsers();
    } catch (err: any) { showSnackbar(err.response?.data?.error || 'Erreur', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Utilisateurs</span></nav>
      <div className="page-header">
        <h1 className="page-title">Gestion des utilisateurs</h1>
        <button className="btn-primary" onClick={() => { setForm(emptyForm); setError(''); setShowModal(true); }}><i className="bi bi-plus"></i> Nouvel utilisateur</button>
      </div>

      {/* Stats par rôle */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {Object.entries(roleConfig).map(([role, cfg]) => (
          <div className="tile" key={role} style={{ textAlign: 'center', padding: '1.25rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 300 }}>{countByRole(role)}</div>
            <span className={`tag ${cfg.tag}`}>{cfg.label}</span>
            <p className="text-muted" style={{ fontSize: '0.6875rem', marginTop: '0.5rem' }}>{cfg.desc}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <table className="data-table">
        <thead><tr><th>Nom d'utilisateur</th><th>Nom</th><th>Prénom</th><th>Rôle</th><th>Statut</th><th>Téléphone</th><th>Créé le</th><th>Actions</th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={u.suspended ? { opacity: 0.6 } : undefined}>
              <td className="fw-600">{u.username}</td>
              <td>{u.nom}</td>
              <td>{u.prenom}</td>
              <td><span className={`tag ${roleConfig[u.role]?.tag || 'tag-gray'}`}>{roleConfig[u.role]?.label || u.role}</span></td>
              <td>
                {u.suspended
                  ? <span className="tag tag-red" title={u.suspended_at ? `Suspendu le ${new Date(u.suspended_at).toLocaleString('fr-FR')}` : ''}>Suspendu</span>
                  : <span className="tag tag-green">Actif</span>}
              </td>
              <td>{u.telephone || '-'}</td>
              <td>{u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '-'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn-icon" title="Voir l'activité" onClick={() => setActivityTarget(u)}><i className="bi bi-clock-history"></i></button>
                {u.id !== currentUser?.id && (
                  <>
                    <button className="btn-icon" title="Réinitialiser le mot de passe" onClick={() => setResetTarget(u)}><i className="bi bi-key"></i></button>
                    <button className="btn-icon" title={u.suspended ? 'Réactiver' : 'Suspendre'} onClick={() => handleSuspendToggle(u)}>
                      <i className={`bi ${u.suspended ? 'bi-unlock' : 'bi-slash-circle'}`}></i>
                    </button>
                    {!u.suspended && (
                      <button className="btn-icon" title="Voir en tant que cet utilisateur" onClick={() => handleImpersonate(u.id)}><i className="bi bi-eye"></i></button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
          {users.length === 0 && <tr><td colSpan={8} className="table-empty">Aucun utilisateur</td></tr>}
        </tbody>
      </table>

      {resetTarget && (
        <ResetPasswordModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => { setResetTarget(null); showSnackbar('Mot de passe réinitialisé — l\'utilisateur devra le changer à sa prochaine connexion', 'success'); }}
        />
      )}
      {activityTarget && (
        <ActivityDrawer target={activityTarget} onClose={() => setActivityTarget(null)} />
      )}

      {/* Modal création */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Nouvel utilisateur</h3><button className="btn-icon" onClick={() => setShowModal(false)}><i className="bi bi-x-lg"></i></button></div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-circle"></i><span>{error}</span></div>}
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Nom d'utilisateur *</label><input type="text" className="form-input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} required placeholder="ex: dr.dupont" /></div>
                  <div className="form-group">
                    <label className="form-label">Mot de passe *</label>
                    <input type="password" className="form-input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required placeholder="Ex: Hospital1" />
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)', background: 'var(--cds-field-01)', padding: '0.5rem 0.75rem' }}>
                      <strong>Règles du mot de passe :</strong>
                      <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                        <li style={{ color: form.password.length >= 8 ? 'var(--cds-support-success)' : 'inherit' }}>
                          {form.password.length >= 8 ? '✓' : '○'} Minimum 8 caractères
                        </li>
                        <li style={{ color: /[A-Z]/.test(form.password) ? 'var(--cds-support-success)' : 'inherit' }}>
                          {/[A-Z]/.test(form.password) ? '✓' : '○'} Au moins 1 majuscule (A-Z)
                        </li>
                        <li style={{ color: /[a-z]/.test(form.password) ? 'var(--cds-support-success)' : 'inherit' }}>
                          {/[a-z]/.test(form.password) ? '✓' : '○'} Au moins 1 minuscule (a-z)
                        </li>
                        <li style={{ color: /[0-9]/.test(form.password) ? 'var(--cds-support-success)' : 'inherit' }}>
                          {/[0-9]/.test(form.password) ? '✓' : '○'} Au moins 1 chiffre (0-9)
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="grid-3">
                  <div className="form-group"><label className="form-label">Nom</label><input type="text" className="form-input" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} /></div>
                  <div className="form-group"><label className="form-label">Prénom</label><input type="text" className="form-input" value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} /></div>
                  <div className="form-group"><label className="form-label">Téléphone</label><input type="tel" className="form-input" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} /></div>
                </div>
                <div className="form-group">
                  <label className="form-label">Rôle *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {Object.entries(roleConfig).map(([role, cfg]) => (
                      <div key={role} className="tile tile-clickable" style={{ padding: '0.75rem', borderLeft: form.role === role ? '3px solid var(--cds-interactive)' : '3px solid transparent', cursor: 'pointer' }} onClick={() => setForm({...form, role})}>
                        <div className="d-flex align-center gap-1">
                          <input type="radio" checked={form.role === role} onChange={() => setForm({...form, role})} />
                          <span className={`tag ${cfg.tag}`}>{cfg.label}</span>
                        </div>
                        <p className="text-muted" style={{ fontSize: '0.6875rem', marginTop: '0.25rem', marginLeft: '1.25rem' }}>{cfg.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button type="submit" className="btn-primary">Créer l'utilisateur</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ResetPasswordModal({ target, onClose, onDone }: { target: AdminUser; onClose: () => void; onDone: () => void }) {
  const [pwd, setPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const rules = [
    { ok: pwd.length >= 8, label: 'Minimum 8 caractères' },
    { ok: /[A-Z]/.test(pwd), label: 'Au moins 1 majuscule' },
    { ok: /[a-z]/.test(pwd), label: 'Au moins 1 minuscule' },
    { ok: /[0-9]/.test(pwd), label: 'Au moins 1 chiffre' },
    { ok: pwd === confirmPwd && pwd.length > 0, label: 'Confirmation identique' },
  ];
  const valid = rules.every(r => r.ok);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true); setError('');
    try {
      await adminResetPassword(target.id, pwd);
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Réinitialiser le mot de passe</h3><button className="btn-icon" onClick={onClose}><i className="bi bi-x-lg"></i></button></div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>
              Nouveau mot de passe pour <strong>{target.prenom} {target.nom}</strong> ({target.username}).
              L'utilisateur sera forcé à le changer à sa prochaine connexion et toutes ses sessions actives seront fermées.
            </p>
            {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-circle"></i><span>{error}</span></div>}
            <div className="form-group"><label className="form-label">Nouveau mot de passe</label><input type="password" className="form-input" value={pwd} onChange={e => setPwd(e.target.value)} autoFocus required /></div>
            <div className="form-group"><label className="form-label">Confirmer</label><input type="password" className="form-input" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required /></div>
            <div style={{ background: 'var(--cds-field-01)', padding: '0.75rem', fontSize: '0.75rem' }}>
              {rules.map((r, i) => (
                <div key={i} style={{ color: r.ok ? 'var(--cds-support-success)' : 'var(--cds-text-secondary)' }}>{r.ok ? '✓' : '○'} {r.label}</div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={!valid || saving}>{saving ? '…' : 'Réinitialiser'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActivityDrawer({ target, onClose }: { target: AdminUser; onClose: () => void }) {
  const [entries, setEntries] = useState<UserAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserAuditLog(target.id, { limit: 200 })
      .then(({ data }) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [target.id]);

  const actionLabels: Record<string, string> = {
    login: 'Connexion', logout: 'Déconnexion', create: 'Création', update: 'Mise à jour',
    delete: 'Suppression', impersonate: 'Impersonation', password_change: 'Changement mot de passe',
    mfa_setup: 'Configuration MFA', export: 'Export', access_denied: 'Accès refusé',
    stop_impersonate: 'Fin impersonation',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3>Activité — {target.prenom} {target.nom} <span className="text-muted" style={{ fontSize: '0.75rem' }}>@{target.username}</span></h3>
          <button className="btn-icon" onClick={onClose}><i className="bi bi-x-lg"></i></button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          {loading ? (
            <div className="text-muted">Chargement…</div>
          ) : entries.length === 0 ? (
            <div className="table-empty">Aucune activité enregistrée</div>
          ) : (
            <table className="data-table" style={{ fontSize: '0.8125rem' }}>
              <thead><tr><th>Date</th><th>Sens</th><th>Action</th><th>Cible</th><th>Détails</th></tr></thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString('fr-FR')}</td>
                    <td>
                      {e.direction === 'by'
                        ? <span className="tag tag-blue" title="Action faite par l'utilisateur">par</span>
                        : <span className="tag tag-purple" title={`Action sur le compte par ${e.actor_prenom ?? ''} ${e.actor_nom ?? e.actor_username ?? '?'}`}>sur</span>}
                    </td>
                    <td>{actionLabels[e.action] ?? e.action}</td>
                    <td>{e.tableName ?? '-'}{e.recordId ? ` #${e.recordId}` : ''}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{e.details ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
