import { useState, useEffect, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createUser, getUsers, getFacilitiesAll } from '../services/api';
import api from '../services/api';
import { useSnackbar } from '../components/Snackbar';
import { AuthContext } from '../App';

const roleConfig: Record<string, { label: string }> = {
  admin: { label: 'Administrateur' },
  medecin: { label: 'Médecin' },
  comptable: { label: 'Comptable' },
  laborantin: { label: 'Laborantin' },
  reception: { label: 'Réception' },
  pharmacien: { label: 'Pharmacien' },
  infirmier: { label: 'Infirmier' },
  super_admin: { label: 'Super Administrateur' },
  chef_pole: { label: 'Chef de pôle' },
};

export default function UtilisateurForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { showSnackbar } = useSnackbar();
  const { user: currentUser } = useContext(AuthContext);
  const [form, setForm] = useState({ username: '', password: '', role: 'reception', nom: '', prenom: '', telephone: '', facility_id: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [facilities, setFacilities] = useState<Array<{ id: number; nom: string }>>([]);

  useEffect(() => {
    const promises: Promise<any>[] = [getUsers()];
    if (currentUser?.role === 'super_admin') promises.push(getFacilitiesAll());
    else promises.push(Promise.resolve(null));

    Promise.all(promises).then(([usersRes, facRes]) => {
      if (facRes?.data) setFacilities(facRes.data);
      if (isEdit) {
        const user = usersRes.data.find((u: any) => u.id === Number(id));
        if (user) {
          setForm({
            username: user.username || '',
            password: '',
            role: user.role || 'reception',
            nom: user.nom || '',
            prenom: user.prenom || '',
            telephone: user.telephone || '',
            facility_id: user.facility_id ? String(user.facility_id) : '',
          });
        } else {
          setError('Utilisateur introuvable');
        }
      }
    }).catch(() => setError('Erreur de chargement')).finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        const payload: Record<string, any> = {
          role: form.role,
          nom: form.nom || null,
          prenom: form.prenom || null,
          telephone: form.telephone || null,
        };
        if (form.password) payload.password = form.password;
        if (currentUser?.role === 'super_admin' && form.facility_id) payload.facility_id = Number(form.facility_id);
        await api.put(`/auth/users/${id}`, payload);
      } else {
        const payload: Record<string, any> = {
          username: form.username,
          password: form.password,
          role: form.role,
          nom: form.nom || null,
          prenom: form.prenom || null,
          telephone: form.telephone || null,
        };
        if (currentUser?.role === 'super_admin' && form.facility_id) payload.facility_id = Number(form.facility_id);
        await createUser(payload);
      }
      showSnackbar(isEdit ? 'Utilisateur modifié' : 'Utilisateur créé', 'success');
      navigate('/app/utilisateurs');
    } catch (err: any) { setError(err.response?.data?.error || 'Erreur'); }
  };

  const pwdRules = [
    { ok: form.password.length >= 8, label: 'Minimum 8 caractères' },
    { ok: /[A-Z]/.test(form.password), label: 'Au moins 1 majuscule (A-Z)' },
    { ok: /[a-z]/.test(form.password), label: 'Au moins 1 minuscule (a-z)' },
    { ok: /[0-9]/.test(form.password), label: 'Au moins 1 chiffre (0-9)' },
    { ok: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(form.password), label: 'Au moins 1 caractère spécial (!@#$...)' },
  ];

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/utilisateurs">Utilisateurs</a><span className="breadcrumb-separator">/</span>
        <span>{isEdit ? 'Modifier' : 'Nouvel utilisateur'}</span>
      </nav>
      <div className="page-header"><h1 className="page-title">{isEdit ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</h1></div>

      {error && <div className="notification notification-error mb-2"><i className="bi bi-exclamation-triangle"></i><span>{error}</span></div>}

      <div className="tile" style={{ padding: '2rem' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Nom d'utilisateur *</label>
              <input type="text" className="form-input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} required readOnly={isEdit} placeholder="ex: dr.dupont" />
              {isEdit && <p className="text-muted" style={{ fontSize: '0.75rem' }}>Le nom d'utilisateur ne peut pas être modifié</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Mot de passe {isEdit ? '(laisser vide pour conserver)' : '*'}</label>
              <div style={{ position: 'relative' }}>
                <input type={showPwd ? 'text' : 'password'} className="form-input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required={!isEdit} placeholder={isEdit ? '••••••••' : 'Ex: Hospital1!'} style={{ paddingRight: '2.5rem' }} />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                  <i className={`bi ${showPwd ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                </button>
              </div>
              {form.password && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)', background: 'var(--cds-field-01)', padding: '0.5rem 0.75rem' }}>
                  <strong>Règles du mot de passe :</strong>
                  <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                    {pwdRules.map((r, i) => (
                      <li key={i} style={{ color: r.ok ? 'var(--cds-support-success)' : 'inherit' }}>
                        {r.ok ? '✓' : '○'} {r.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="grid-3">
            <div className="form-group"><label className="form-label">Nom</label><input type="text" className="form-input" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} placeholder="Nom de famille" /></div>
            <div className="form-group"><label className="form-label">Prénom</label><input type="text" className="form-input" value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} placeholder="Prénom" /></div>
            <div className="form-group"><label className="form-label">Téléphone</label><input type="tel" className="form-input" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} placeholder="ex: 699 000 000" /></div>
          </div>

          <div className="form-group">
            <label className="form-label">Rôle *</label>
            <select className="form-select" value={form.role} onChange={e => setForm({...form, role: e.target.value})} required>
              {Object.entries(roleConfig).map(([role, cfg]) => <option key={role} value={role}>{cfg.label}</option>)}
            </select>
          </div>

          {currentUser?.role === 'super_admin' && (
            <div className="form-group">
              <label className="form-label">Établissement</label>
              <select className="form-select" value={form.facility_id} onChange={e => setForm({...form, facility_id: e.target.value})}>
                <option value="">Aucun établissement assigné</option>
                {facilities.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-ui-03)' }}>
            <button type="button" className="btn-secondary" onClick={() => navigate('/app/utilisateurs')}>Annuler</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Enregistrer' : 'Créer l\'utilisateur'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
