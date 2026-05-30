import { useEffect, useState } from 'react';
import { useSnackbar } from '../components/Snackbar';
import { useBranding } from '../components/BrandingProvider';
import api, { previewPrintTemplate } from '../services/api';

interface Setting { id: number; cle: string; valeur: string; description: string; categorie: string }

const SECTIONS = [
  { key: 'facture', title: 'Facture', enteteKey: 'entete_facture', piedKey: 'pied_facture', enteteHint: 'Ex: établissement multi-sites, code TVA, slogan…', piedHint: 'Ex: « TVA non applicable, art. 293B du CGI » ou conditions de paiement.' },
  { key: 'ordonnance', title: 'Ordonnance', enteteKey: 'entete_ordonnance', piedKey: 'pied_ordonnance', enteteHint: 'Ex: spécialité du médecin, numéro RPPS.', piedHint: 'Ex: « Ordonnance non renouvelable » ou consignes de pharmacovigilance.' },
  { key: 'labo', title: 'Résultats de laboratoire', enteteKey: 'entete_labo', piedKey: 'pied_labo', enteteHint: 'Ex: nom du responsable du laboratoire.', piedHint: 'Ex: « Résultats à interpréter par le médecin traitant ».' },
] as const;

export default function Impressions() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { showSnackbar } = useSnackbar();
  const { reload: reloadBranding } = useBranding();

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => {
    if (!settings.length) return;
    const initial: Record<string, string> = {};
    for (const s of settings) initial[s.cle] = s.valeur;
    setDrafts(initial);
  }, [settings]);

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

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb">
        <a href="/app">Accueil</a><span className="breadcrumb-separator">/</span>
        <a href="/app/configuration">Configuration</a><span className="breadcrumb-separator">/</span>
        <span>Impressions</span>
      </nav>
      <div className="page-header"><h1 className="page-title">Impressions</h1></div>

      <div className="tile mb-2" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Personnalisation des impressions</h3>
        <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>
          Laissez un champ vide pour utiliser l'en-tête ou le pied de page standard (généré à partir du logo, du nom, des coordonnées et des mentions légales).
          Pour personnaliser, écrivez votre texte libre — les sauts de ligne sont préservés. Le HTML est échappé pour la sécurité.
        </p>
        <div className="d-flex gap-1 mb-2" style={{ flexWrap: 'wrap' }}>
          <button className="btn-ghost btn-sm" onClick={() => previewPrintTemplate('facture')}><i className="bi bi-eye"></i> Aperçu facture</button>
          <button className="btn-ghost btn-sm" onClick={() => previewPrintTemplate('ordonnance')}><i className="bi bi-eye"></i> Aperçu ordonnance</button>
          <button className="btn-ghost btn-sm" onClick={() => previewPrintTemplate('labo')}><i className="bi bi-eye"></i> Aperçu résultats labo</button>
        </div>
      </div>

      {SECTIONS.map(section => (
        <div key={section.key} className="tile mb-2" style={{ padding: '1.5rem' }}>
          <div className="d-flex justify-between align-center mb-2">
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{section.title}</h3>
            <button className="btn-ghost btn-sm" onClick={() => previewPrintTemplate(section.key)}><i className="bi bi-eye"></i> Aperçu</button>
          </div>
          <div className="form-group">
            <label className="form-label">En-tête personnalisé</label>
            <textarea className="form-input" rows={3} value={drafts[section.enteteKey] ?? ''} onChange={e => setDrafts({ ...drafts, [section.enteteKey]: e.target.value })} placeholder={section.enteteHint} />
          </div>
          <div className="form-group">
            <label className="form-label">Pied de page personnalisé</label>
            <textarea className="form-input" rows={3} value={drafts[section.piedKey] ?? ''} onChange={e => setDrafts({ ...drafts, [section.piedKey]: e.target.value })} placeholder={section.piedHint} />
          </div>
          <button className="btn-primary btn-sm" onClick={() => saveBatch([section.enteteKey, section.piedKey], section.title)}>Enregistrer {section.title}</button>
        </div>
      ))}
    </div>
  );
}
