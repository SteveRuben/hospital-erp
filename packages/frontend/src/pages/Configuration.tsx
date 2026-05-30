import { useState, useEffect } from 'react';
import { useSnackbar } from '../components/Snackbar';
import { useBranding } from '../components/BrandingProvider';
import api, { uploadLogo, deleteLogo } from '../services/api';

const THEMES: Array<{ key: string; label: string; accent: string; header: string }> = [
  { key: 'cds-blue',      label: 'Bleu Carbon',   accent: '#0f62fe', header: '#161616' },
  { key: 'medical-green', label: 'Vert médical',  accent: '#198038', header: '#044317' },
  { key: 'royal-purple',  label: 'Pourpre royal', accent: '#8a3ffc', header: '#31135e' },
  { key: 'coral',         label: 'Corail',        accent: '#fa4d56', header: '#520408' },
  { key: 'teal',          label: 'Sarcelle',      accent: '#1192e8', header: '#003a6d' },
  { key: 'slate',         label: 'Ardoise',       accent: '#525252', header: '#262626' },
];

const DEVISES: Array<{ code: string; label: string }> = [
  { code: 'XOF', label: 'XOF — Franc CFA (BCEAO)' },
  { code: 'XAF', label: 'XAF — Franc CFA (BEAC)' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'USD', label: 'USD — Dollar américain' },
  { code: 'NGN', label: 'NGN — Naira nigérian' },
  { code: 'GHS', label: 'GHS — Cedi ghanéen' },
  { code: 'MAD', label: 'MAD — Dirham marocain' },
  { code: 'TND', label: 'TND — Dinar tunisien' },
  { code: 'CAD', label: 'CAD — Dollar canadien' },
  { code: 'CHF', label: 'CHF — Franc suisse' },
  { code: 'GBP', label: 'GBP — Livre sterling' },
];

const PAYS: Array<{ code: string; label: string }> = [
  { code: '',   label: '— Aucun (pas de formatage des téléphones) —' },
  { code: 'CM', label: 'Cameroun (CM)' },
  { code: 'CI', label: 'Côte d\'Ivoire (CI)' },
  { code: 'SN', label: 'Sénégal (SN)' },
  { code: 'BJ', label: 'Bénin (BJ)' },
  { code: 'TG', label: 'Togo (TG)' },
  { code: 'BF', label: 'Burkina Faso (BF)' },
  { code: 'ML', label: 'Mali (ML)' },
  { code: 'NE', label: 'Niger (NE)' },
  { code: 'GA', label: 'Gabon (GA)' },
  { code: 'CG', label: 'Congo-Brazzaville (CG)' },
  { code: 'CD', label: 'République démocratique du Congo (CD)' },
  { code: 'GN', label: 'Guinée (GN)' },
  { code: 'TD', label: 'Tchad (TD)' },
  { code: 'CF', label: 'République centrafricaine (CF)' },
  { code: 'MG', label: 'Madagascar (MG)' },
  { code: 'MA', label: 'Maroc (MA)' },
  { code: 'TN', label: 'Tunisie (TN)' },
  { code: 'DZ', label: 'Algérie (DZ)' },
  { code: 'FR', label: 'France (FR)' },
  { code: 'BE', label: 'Belgique (BE)' },
  { code: 'CA', label: 'Canada (CA)' },
  { code: 'CH', label: 'Suisse (CH)' },
];

interface Setting { id: number; cle: string; valeur: string; description: string; categorie: string }

export default function Configuration() {
  const [tab, setTab] = useState<'branding' | 'coordonnees'>('branding');
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const { showSnackbar } = useSnackbar();
  const { branding, reload: reloadBranding } = useBranding();
  const [nomDraft, setNomDraft] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!settings.length) return;
    const initial: Record<string, string> = {};
    for (const s of settings) initial[s.cle] = s.valeur;
    setDrafts(initial);
  }, [settings]);

  useEffect(() => { setNomDraft(branding.nom_etablissement); }, [branding.nom_etablissement]);
  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try { const { data } = await api.get('/settings'); setSettings(data); }
    catch { showSnackbar('Erreur chargement paramètres', 'error'); }
    finally { setLoading(false); }
  };

  const saveBatch = async (keys: string[], label: string) => {
    const payload = keys.filter(k => drafts[k] !== undefined).map(cle => ({ cle, valeur: drafts[cle] ?? '' }));
    try {
      await api.put('/settings', payload);
      showSnackbar(`${label} enregistré${payload.length > 1 ? 's' : ''}`, 'success');
      loadSettings();
      reloadBranding();
    } catch (err: any) { showSnackbar(err.response?.data?.error || 'Erreur', 'error'); }
  };

  const COORDONNEES_KEYS = ['adresse_etablissement', 'ville_etablissement', 'pays_etablissement', 'telephone_etablissement', 'email_etablissement'];
  const LEGAL_KEYS = ['numero_agrement', 'directeur_etablissement'];
  const REGIONAL_KEYS = ['code_pays', 'devise'];

  const saveTheme = async (themeKey: string) => {
    try {
      await api.put('/settings/theme', { valeur: themeKey });
      await reloadBranding();
      showSnackbar('Thème mis à jour', 'success');
    } catch (err: any) { showSnackbar(err.response?.data?.error || 'Erreur', 'error'); }
  };

  const saveNomEtablissement = async () => {
    if (!nomDraft.trim()) { showSnackbar('Le nom est requis', 'warning'); return; }
    try {
      await api.put('/settings/nom_etablissement', { valeur: nomDraft.trim() });
      await reloadBranding();
      showSnackbar('Nom de l\'établissement mis à jour', 'success');
    } catch { showSnackbar('Erreur', 'error'); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showSnackbar('Logo trop volumineux (max 2 Mo)', 'warning'); e.target.value = ''; return; }
    setUploadingLogo(true);
    try {
      await uploadLogo(file);
      await reloadBranding();
      showSnackbar('Logo mis à jour', 'success');
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur lors de l\'upload', 'error');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleLogoDelete = async () => {
    try {
      await deleteLogo();
      await reloadBranding();
      showSnackbar('Logo supprimé', 'success');
    } catch { showSnackbar('Erreur', 'error'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Configuration</span></nav>
      <div className="page-header"><h1 className="page-title">Configuration</h1></div>

      {/* Sous-menus pointant vers les pages dédiées. Garde la découverte
          via l'accueil Configuration tout en respectant la hiérarchie de la sidebar. */}
      <div className="tile mb-3" style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
        <a href="/app/impressions" className="tile tile-clickable" style={{ padding: '1rem', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <i className="bi bi-printer" style={{ fontSize: '1.5rem', color: 'var(--cds-interactive)' }}></i>
          <div><div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Impressions</div><div className="text-muted" style={{ fontSize: '0.75rem' }}>En-têtes et pieds de page</div></div>
        </a>
        <a href="/app/parametres-generaux" className="tile tile-clickable" style={{ padding: '1rem', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <i className="bi bi-sliders" style={{ fontSize: '1.5rem', color: 'var(--cds-interactive)' }}></i>
          <div><div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Paramètres généraux</div><div className="text-muted" style={{ fontSize: '0.75rem' }}>Valeurs par défaut système</div></div>
        </a>
        <a href="/app/listes-reference" className="tile tile-clickable" style={{ padding: '1rem', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <i className="bi bi-list-ul" style={{ fontSize: '1.5rem', color: 'var(--cds-interactive)' }}></i>
          <div><div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Listes de référence</div><div className="text-muted" style={{ fontSize: '0.75rem' }}>Catégories et nomenclatures</div></div>
        </a>
      </div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'branding' ? 'active' : ''}`} onClick={() => setTab('branding')}>Identité visuelle</button>
        <button className={`tab-item ${tab === 'coordonnees' ? 'active' : ''}`} onClick={() => setTab('coordonnees')}>Coordonnées</button>
      </div>

      {tab === 'coordonnees' && (
        <div>
          <div className="tile mb-2" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Coordonnées de l'établissement</h3>
            <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>Apparaissent dans l'en-tête de toutes les impressions (factures, ordonnances, résultats de labo).</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Adresse</label>
                <input type="text" className="form-input" value={drafts.adresse_etablissement ?? ''} onChange={e => setDrafts({ ...drafts, adresse_etablissement: e.target.value })} placeholder="01 BP 1234" />
              </div>
              <div className="form-group">
                <label className="form-label">Ville</label>
                <input type="text" className="form-input" value={drafts.ville_etablissement ?? ''} onChange={e => setDrafts({ ...drafts, ville_etablissement: e.target.value })} placeholder="Abidjan" />
              </div>
              <div className="form-group">
                <label className="form-label">Pays</label>
                <input type="text" className="form-input" value={drafts.pays_etablissement ?? ''} onChange={e => setDrafts({ ...drafts, pays_etablissement: e.target.value })} placeholder="Côte d'Ivoire" />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone</label>
                <input type="tel" className="form-input" value={drafts.telephone_etablissement ?? ''} onChange={e => setDrafts({ ...drafts, telephone_etablissement: e.target.value })} placeholder="+225 27 22 00 00 00" />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={drafts.email_etablissement ?? ''} onChange={e => setDrafts({ ...drafts, email_etablissement: e.target.value })} placeholder="contact@hopital.ci" />
              </div>
            </div>
            <button className="btn-primary" onClick={() => saveBatch(COORDONNEES_KEYS, 'Coordonnées')}>Enregistrer les coordonnées</button>
          </div>

          <div className="tile mb-2" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Paramètres régionaux</h3>
            <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>Devise affichée sur les factures et code pays utilisé pour formater les numéros de téléphone dans toute l'application.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Code pays (téléphones)</label>
                <select className="form-select" value={drafts.code_pays ?? ''} onChange={e => setDrafts({ ...drafts, code_pays: e.target.value })}>
                  {PAYS.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Devise</label>
                <select className="form-select" value={drafts.devise ?? 'XOF'} onChange={e => setDrafts({ ...drafts, devise: e.target.value })}>
                  {DEVISES.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
                </select>
              </div>
            </div>
            <button className="btn-primary" onClick={() => saveBatch(REGIONAL_KEYS, 'Paramètres régionaux')}>Enregistrer les paramètres régionaux</button>
          </div>

          <div className="tile" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Mentions légales</h3>
            <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>Apparaissent au pied des documents officiels.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">N° d'agrément</label>
                <input type="text" className="form-input" value={drafts.numero_agrement ?? ''} onChange={e => setDrafts({ ...drafts, numero_agrement: e.target.value })} placeholder="MS/CI/2024/00123" />
              </div>
              <div className="form-group">
                <label className="form-label">Directeur médical</label>
                <input type="text" className="form-input" value={drafts.directeur_etablissement ?? ''} onChange={e => setDrafts({ ...drafts, directeur_etablissement: e.target.value })} placeholder="Dr. Konan Yao" />
              </div>
            </div>
            <button className="btn-primary" onClick={() => saveBatch(LEGAL_KEYS, 'Mentions légales')}>Enregistrer les mentions</button>
          </div>
        </div>
      )}

      {tab === 'branding' && (
        <div>
          <div className="tile mb-2" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Nom de l'établissement</h3>
            <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>Affiché en en-tête, sur la page de connexion, et dans toutes les impressions.</p>
            <div className="d-flex gap-1" style={{ maxWidth: '500px' }}>
              <input type="text" className="form-input" value={nomDraft} onChange={e => setNomDraft(e.target.value)} placeholder="CHU de Cocody" />
              <button className="btn-primary" onClick={saveNomEtablissement} disabled={nomDraft.trim() === branding.nom_etablissement}>Enregistrer</button>
            </div>
          </div>

          <div className="tile mb-2" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Logo</h3>
            <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>PNG, JPG, SVG ou WebP. Max 2 Mo. Affiché en en-tête et sur la page de connexion. Format recommandé : carré ou horizontal, fond transparent.</p>
            <div className="d-flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
              <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cds-ui-01)', border: '1px dashed var(--cds-ui-03)' }}>
                {branding.logo_url
                  ? <img src={branding.logo_url} alt="Logo actuel" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  : <i className="bi bi-image text-muted" style={{ fontSize: '2rem' }}></i>}
              </div>
              <div className="d-flex gap-1">
                <label className="btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                  <i className="bi bi-upload"></i> {uploadingLogo ? 'Upload...' : (branding.logo_url ? 'Remplacer' : 'Téléverser')}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoUpload} style={{ display: 'none' }} disabled={uploadingLogo} />
                </label>
                {branding.logo_url && (
                  <button className="btn-ghost btn-sm" onClick={handleLogoDelete}><i className="bi bi-trash"></i> Supprimer</button>
                )}
              </div>
            </div>
          </div>

          <div className="tile" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Thème de couleur</h3>
            <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>Couleur d'accentuation utilisée dans toute l'interface. Choisissez parmi les 6 palettes pré-validées pour un rendu cohérent.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {THEMES.map(t => {
                const active = branding.theme === t.key;
                return (
                  <button key={t.key} onClick={() => saveTheme(t.key)} style={{ background: 'var(--cds-ui-02)', border: active ? `2px solid ${t.accent}` : '1px solid var(--cds-ui-03)', padding: '0.75rem', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <div style={{ width: '32px', height: '32px', background: t.header }}></div>
                      <div style={{ width: '32px', height: '32px', background: t.accent }}></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{t.label}</span>
                      {active && <i className="bi bi-check-circle-fill" style={{ color: t.accent, fontSize: '1rem' }}></i>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
