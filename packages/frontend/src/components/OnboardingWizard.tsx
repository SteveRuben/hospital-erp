import { useState, useEffect, useCallback, useContext } from 'react';
import { useBranding } from './BrandingProvider';
import { useSnackbar } from './Snackbar';
import { AuthContext } from '../App';
import api, { uploadLogo, dismissOnboarding } from '../services/api';

/**
 * Multi-step "first run" wizard for admins. Pops up when the establishment
 * settings still look default (nom = 'Hospital ERP' OR adresse empty) and
 * walks an admin through identity → coordonnees → mentions légales.
 *
 * Dismissal is per-session (sessionStorage flag); the next login re-prompts
 * until the data is actually filled in. The Layout banner provides a
 * persistent re-entry point so a dismissed wizard isn't lost.
 */

const THEMES = [
  { key: 'cds-blue', label: 'Bleu Carbon', accent: '#0f62fe', header: '#161616' },
  { key: 'medical-green', label: 'Vert médical', accent: '#198038', header: '#044317' },
  { key: 'royal-purple', label: 'Pourpre royal', accent: '#8a3ffc', header: '#31135e' },
  { key: 'coral', label: 'Corail', accent: '#fa4d56', header: '#520408' },
  { key: 'teal', label: 'Sarcelle', accent: '#1192e8', header: '#003a6d' },
  { key: 'slate', label: 'Ardoise', accent: '#525252', header: '#262626' },
];

interface Props {
  onClose: () => void;
}

export default function OnboardingWizard({ onClose }: Props) {
  const { branding, reload } = useBranding();
  const { showSnackbar } = useSnackbar();
  const { user, login } = useContext(AuthContext);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [form, setForm] = useState({
    nom_etablissement: '',
    theme: 'cds-blue',
    adresse_etablissement: '',
    ville_etablissement: '',
    pays_etablissement: '',
    telephone_etablissement: '',
    email_etablissement: '',
    numero_agrement: '',
    directeur_etablissement: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Hydrate the form with existing values so a partial re-run doesn't wipe data
  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      const map: Record<string, string> = {};
      for (const s of data) map[s.cle] = s.valeur;
      setForm(f => ({
        nom_etablissement: map.nom_etablissement === 'Hospital ERP' ? '' : (map.nom_etablissement || ''),
        theme: map.theme || 'cds-blue',
        adresse_etablissement: map.adresse_etablissement || '',
        ville_etablissement: map.ville_etablissement || '',
        pays_etablissement: map.pays_etablissement || '',
        telephone_etablissement: map.telephone_etablissement || '',
        email_etablissement: map.email_etablissement || '',
        numero_agrement: map.numero_agrement || '',
        directeur_etablissement: map.directeur_etablissement || '',
      }));
    }).catch(() => { /* user may not be admin, wizard will fail on save then */ });
  }, []);

  // Persist the dismissal server-side so it survives a browser restart and
  // is per-admin. The 7-day cooldown is enforced client-side in Layout.tsx
  // because cooldown is a UI concern, not a security one.
  const dismissForCooldown = useCallback(async () => {
    setDismissing(true);
    try {
      const { data } = await dismissOnboarding();
      if (user) {
        login({ ...user, onboarding_dismissed_at: data.onboarding_dismissed_at }, localStorage.getItem('token') || '');
      }
      onClose();
    } catch {
      // Even if the server call fails, close the modal locally so the admin
      // can keep working — the banner will still nudge them back.
      onClose();
    } finally {
      setDismissing(false);
    }
  }, [onClose, user, login]);

  const saveAll = async () => {
    if (!form.nom_etablissement.trim()) {
      showSnackbar('Le nom de l\'établissement est requis', 'warning');
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      // Upload logo first (if provided) so the URL is in settings before bulk save
      if (logoFile) {
        try { await uploadLogo(logoFile); } catch { showSnackbar('Échec de l\'upload du logo (les autres champs vont être enregistrés)', 'warning'); }
      }
      const payload = Object.entries(form).map(([cle, valeur]) => ({ cle, valeur: valeur.trim() }));
      await api.put('/settings', payload);
      await reload();
      showSnackbar('Configuration de l\'établissement enregistrée', 'success');
      onClose();
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur lors de l\'enregistrement', 'error');
    } finally {
      setSaving(false);
    }
  };

  const Stepper = () => (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{ flex: 1, height: '4px', background: i <= step ? 'var(--cds-interactive)' : 'var(--cds-ui-03)', transition: 'background 0.2s' }} />
      ))}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'var(--cds-ui-02)', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '2rem', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
        <Stepper />

        {step === 0 && (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 300, marginBottom: '0.5rem' }}>Bienvenue dans Hospital ERP</h2>
            <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1.5rem' }}>
              Avant de commencer, configurons votre établissement en 4 étapes rapides.
              Vous pourrez modifier ces informations plus tard depuis <strong>Configuration → Identité visuelle</strong>.
            </p>
            <ul style={{ marginLeft: '1.5rem', marginBottom: '1.5rem', color: 'var(--cds-text-secondary)', fontSize: '0.875rem', lineHeight: 1.8 }}>
              <li>Identité visuelle (nom, logo, thème de couleur)</li>
              <li>Coordonnées (adresse, téléphone, email)</li>
              <li>Mentions légales (N° d'agrément, directeur)</li>
            </ul>
          </>
        )}

        {step === 1 && (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 500, marginBottom: '0.5rem' }}>Identité de l'établissement</h2>
            <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Le nom et le logo apparaîtront sur la page de connexion, dans le bandeau, et sur toutes les impressions.</p>
            <div className="form-group">
              <label className="form-label">Nom de l'établissement <span style={{ color: 'var(--cds-support-error)' }}>*</span></label>
              <input type="text" className="form-input" value={form.nom_etablissement} onChange={e => setForm({ ...form, nom_etablissement: e.target.value })} placeholder="CHU de Cocody" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Logo (optionnel)</label>
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={e => setLogoFile(e.target.files?.[0] || null)} />
              {logoFile && <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>{logoFile.name} ({Math.round(logoFile.size / 1024)} Ko)</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Thème de couleur</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
                {THEMES.map(t => {
                  const active = form.theme === t.key;
                  return (
                    <button key={t.key} type="button" onClick={() => setForm({ ...form, theme: t.key })} style={{ background: 'var(--cds-ui-02)', border: active ? `2px solid ${t.accent}` : '1px solid var(--cds-ui-03)', padding: '0.5rem', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem', justifyContent: 'center' }}>
                        <div style={{ width: '20px', height: '20px', background: t.header }}></div>
                        <div style={{ width: '20px', height: '20px', background: t.accent }}></div>
                      </div>
                      <span style={{ fontSize: '0.75rem' }}>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 500, marginBottom: '0.5rem' }}>Coordonnées</h2>
            <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Ces informations apparaissent dans l'en-tête des documents officiels.</p>
            <div className="form-group">
              <label className="form-label">Adresse</label>
              <input type="text" className="form-input" value={form.adresse_etablissement} onChange={e => setForm({ ...form, adresse_etablissement: e.target.value })} placeholder="01 BP 1234" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Ville</label>
                <input type="text" className="form-input" value={form.ville_etablissement} onChange={e => setForm({ ...form, ville_etablissement: e.target.value })} placeholder="Abidjan" />
              </div>
              <div className="form-group">
                <label className="form-label">Pays</label>
                <input type="text" className="form-input" value={form.pays_etablissement} onChange={e => setForm({ ...form, pays_etablissement: e.target.value })} placeholder="Côte d'Ivoire" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Téléphone</label>
              <input type="tel" className="form-input" value={form.telephone_etablissement} onChange={e => setForm({ ...form, telephone_etablissement: e.target.value })} placeholder="+225 27 22 00 00 00" />
            </div>
            <div className="form-group">
              <label className="form-label">Email de contact</label>
              <input type="email" className="form-input" value={form.email_etablissement} onChange={e => setForm({ ...form, email_etablissement: e.target.value })} placeholder="contact@hopital.ci" />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 500, marginBottom: '0.5rem' }}>Mentions légales</h2>
            <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Apparaissent au pied des factures, ordonnances et résultats de laboratoire.</p>
            <div className="form-group">
              <label className="form-label">N° d'agrément ministériel</label>
              <input type="text" className="form-input" value={form.numero_agrement} onChange={e => setForm({ ...form, numero_agrement: e.target.value })} placeholder="MS/CI/2024/00123" />
            </div>
            <div className="form-group">
              <label className="form-label">Directeur médical</label>
              <input type="text" className="form-input" value={form.directeur_etablissement} onChange={e => setForm({ ...form, directeur_etablissement: e.target.value })} placeholder="Dr. Konan Yao" />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 500, marginBottom: '0.5rem' }}>Récapitulatif</h2>
            <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Vérifiez les informations avant d'enregistrer.</p>
            <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.5rem 1rem', fontSize: '0.875rem' }}>
              <dt style={{ color: 'var(--cds-text-secondary)' }}>Établissement</dt><dd>{form.nom_etablissement || <em style={{ color: 'var(--cds-support-error)' }}>(requis)</em>}</dd>
              <dt style={{ color: 'var(--cds-text-secondary)' }}>Thème</dt><dd>{THEMES.find(t => t.key === form.theme)?.label}</dd>
              <dt style={{ color: 'var(--cds-text-secondary)' }}>Logo</dt><dd>{logoFile ? logoFile.name : (branding.logo_url ? '(déjà configuré)' : '—')}</dd>
              <dt style={{ color: 'var(--cds-text-secondary)' }}>Adresse</dt><dd>{[form.adresse_etablissement, form.ville_etablissement, form.pays_etablissement].filter(Boolean).join(', ') || '—'}</dd>
              <dt style={{ color: 'var(--cds-text-secondary)' }}>Téléphone</dt><dd>{form.telephone_etablissement || '—'}</dd>
              <dt style={{ color: 'var(--cds-text-secondary)' }}>Email</dt><dd>{form.email_etablissement || '—'}</dd>
              <dt style={{ color: 'var(--cds-text-secondary)' }}>N° agrément</dt><dd>{form.numero_agrement || '—'}</dd>
              <dt style={{ color: 'var(--cds-text-secondary)' }}>Directeur</dt><dd>{form.directeur_etablissement || '—'}</dd>
            </dl>
          </>
        )}

        <div className="d-flex justify-between align-center" style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--cds-ui-03)' }}>
          <button className="btn-ghost" onClick={dismissForCooldown} disabled={saving || dismissing}>{dismissing ? 'Fermeture…' : 'Passer (rappel dans 7 jours)'}</button>
          <div className="d-flex gap-1">
            {step > 0 && <button className="btn-ghost" onClick={() => setStep(step - 1)} disabled={saving}>← Précédent</button>}
            {step < 4 && <button className="btn-primary" onClick={() => setStep(step + 1)} disabled={saving}>Suivant →</button>}
            {step === 4 && <button className="btn-primary" onClick={saveAll} disabled={saving || !form.nom_etablissement.trim()}>{saving ? 'Enregistrement…' : 'Enregistrer la configuration'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
