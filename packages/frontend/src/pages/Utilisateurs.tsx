import { useState, useEffect } from 'react';
import { getUsers, createUser } from '../services/api';
import type { User } from '../types';

const roleConfig: Record<string, { label: string; tag: string; desc: string }> = {
  admin: { label: 'Administrateur', tag: 'tag-red', desc: 'Accès complet à tous les modules' },
  medecin: { label: 'Médecin', tag: 'tag-blue', desc: 'Patients, consultations, prescriptions' },
  comptable: { label: 'Comptable', tag: 'tag-green', desc: 'Finances, facturation' },
  laborantin: { label: 'Laborantin', tag: 'tag-purple', desc: 'Module laboratoire' },
  reception: { label: 'Réception', tag: 'tag-orange', desc: 'Patients, RDV, file d\'attente' },
};

const emptyForm = { username: '', password: '', role: 'reception' as string, nom: '', prenom: '', telephone: '' };

export default function Utilisateurs() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

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
        <thead><tr><th>Nom d'utilisateur</th><th>Nom</th><th>Prénom</th><th>Rôle</th><th>Téléphone</th><th>Créé le</th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td className="fw-600">{u.username}</td>
              <td>{u.nom}</td>
              <td>{u.prenom}</td>
              <td><span className={`tag ${roleConfig[u.role]?.tag || 'tag-gray'}`}>{roleConfig[u.role]?.label || u.role}</span></td>
              <td>{u.telephone || '-'}</td>
              <td>{(u as any).created_at ? new Date((u as any).created_at).toLocaleDateString('fr-FR') : '-'}</td>
            </tr>
          ))}
          {users.length === 0 && <tr><td colSpan={6} className="table-empty">Aucun utilisateur</td></tr>}
        </tbody>
      </table>

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
                  <div className="form-group"><label className="form-label">Mot de passe *</label><input type="password" className="form-input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required placeholder="Min 8 chars, 1 maj, 1 min, 1 chiffre" /></div>
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