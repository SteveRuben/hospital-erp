import { useState, useEffect } from 'react';
import { useSnackbar } from '../components/Snackbar';
import { useConfirm } from '../components/ConfirmDialog';
import { useBranding } from '../components/BrandingProvider';
import { formatMoney } from '../components/format';
import api, { getTarifsByCategorie, type TarifRow } from '../services/api';

/**
 * Unified catalog for lab exam types + their pricing.
 *
 * Before this page, two disjoint surfaces had to be kept in sync by hand:
 *   1. Configuration → Listes de référence → "Types d'examen labo" — just
 *      the libellé list with no price information.
 *   2. Facturation → Tarifs (filtered to categorie='examen') — code +
 *      libellé + montant, but living in a generic-tariff page that does
 *      not surface the lab context.
 *
 * The auto-fill on the ExamenForm only works when the tariff's libellé
 * matches the type the user picked, so the duplication was a frequent
 * source of "le montant ne se remplit pas" complaints.
 *
 * This page is the single source of truth: each row is a tariff in the
 * 'examen' category — adding here makes the entry available both as a
 * type suggestion in the exam-creation combobox AND as the price to
 * auto-fill montant.
 */

interface CatalogEntry {
  id: number;
  code: string;
  libelle: string;
  categorie: string;
  montant: number | string;
  actif?: boolean;
}

const emptyForm = { code: '', libelle: '', montant: '' };

export default function CatalogueExamens() {
  const { showSnackbar } = useSnackbar();
  const { confirm } = useConfirm();
  const { branding } = useBranding();
  const money = (n: number) => formatMoney(n, branding.devise);
  const [items, setItems] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CatalogEntry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getTarifsByCategorie('examen');
      setItems(data as unknown as CatalogEntry[]);
    } catch { showSnackbar('Erreur de chargement', 'error'); }
    finally { setLoading(false); }
  };

  const startCreate = () => { setEditing(null); setForm(emptyForm); };
  const startEdit = (it: CatalogEntry) => {
    setEditing(it);
    setForm({ code: it.code, libelle: it.libelle, montant: String(it.montant ?? '') });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.libelle.trim()) { showSnackbar('Libellé requis', 'warning'); return; }
    if (!form.code.trim()) { showSnackbar('Code requis (ex: EXM-GLY)', 'warning'); return; }
    const montant = form.montant === '' ? 0 : Number(form.montant);
    if (!Number.isFinite(montant) || montant < 0) { showSnackbar('Montant invalide', 'warning'); return; }
    try {
      if (editing) {
        // Existing route handles update; categorie stays 'examen'.
        await api.put(`/facturation/tarifs/${editing.id}`, {
          code: form.code.trim(),
          libelle: form.libelle.trim(),
          categorie: 'examen',
          montant,
        });
        showSnackbar('Examen mis à jour', 'success');
      } else {
        await api.post('/facturation/tarifs', {
          code: form.code.trim(),
          libelle: form.libelle.trim(),
          categorie: 'examen',
          montant,
        });
        showSnackbar('Examen ajouté au catalogue', 'success');
      }
      setEditing(null);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur', 'error');
    }
  };

  const handleDelete = async (it: CatalogEntry) => {
    const ok = await confirm({
      title: "Supprimer l'examen du catalogue",
      message: `Supprimer « ${it.libelle} » du catalogue ? Les examens déjà créés avec cet intitulé restent intacts ; seule l'entrée du catalogue est retirée.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/facturation/tarifs/${it.id}`);
      showSnackbar('Supprimé', 'success');
      load();
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur', 'error');
    }
  };

  const filtered = search
    ? items.filter(it =>
        it.libelle.toLowerCase().includes(search.toLowerCase()) ||
        it.code.toLowerCase().includes(search.toLowerCase()))
    : items;

  // Suggest the next code automatically when adding a new entry — keeps the
  // codes coherent without forcing the user to think one up each time.
  const suggestCode = (libelle: string): string => {
    const initials = libelle
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.slice(0, 3))
      .join('-')
      .slice(0, 16);
    return initials ? `EXM-${initials}` : 'EXM-';
  };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Catalogue d'examens</span></nav>
      <div className="page-header"><h1 className="page-title">Catalogue d'examens</h1></div>

      <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>
        Liste unique des examens labo proposés par l'établissement, avec leurs tarifs.
        Cette liste est utilisée à la fois comme suggestions dans le formulaire « Nouvel
        examen » et pour pré-remplir le montant à facturer. Modifier le tarif ici met
        à jour automatiquement les nouveaux examens créés.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '1rem' }}>
        {/* List */}
        <div className="tile" style={{ padding: '1rem' }}>
          <div className="d-flex justify-between align-center mb-1">
            <input
              type="text"
              className="form-input"
              placeholder="Rechercher (libellé ou code)"
              style={{ maxWidth: '260px' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>{filtered.length} examen{filtered.length > 1 ? 's' : ''}</span>
          </div>
          {loading ? (
            <div className="text-muted" style={{ fontSize: '0.8125rem' }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="table-empty" style={{ padding: '2rem' }}>
              <i className="bi bi-flask" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}></i>
              {items.length === 0 ? 'Aucun examen dans le catalogue — ajoutez le premier à droite.' : 'Aucun examen ne correspond à la recherche.'}
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Code</th><th>Libellé</th><th>Tarif</th><th style={{ width: 1 }}></th></tr></thead>
              <tbody>
                {filtered.map(it => (
                  <tr key={it.id} style={editing?.id === it.id ? { background: 'var(--cds-ui-01)' } : undefined}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{it.code}</td>
                    <td className="fw-600">{it.libelle}</td>
                    <td>{money(Number(it.montant))}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-icon" title="Modifier" onClick={() => startEdit(it)}><i className="bi bi-pencil"></i></button>
                      <button className="btn-icon" title="Supprimer" onClick={() => handleDelete(it)}><i className="bi bi-trash"></i></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Form */}
        <div className="tile" style={{ padding: '1.5rem' }}>
          <div className="d-flex justify-between align-center mb-1">
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{editing ? "Modifier l'examen" : 'Nouvel examen'}</h3>
            {editing && <button className="btn-ghost btn-sm" onClick={startCreate}><i className="bi bi-plus"></i> Nouveau</button>}
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Libellé *</label>
              <input
                type="text"
                className="form-input"
                value={form.libelle}
                onChange={e => {
                  const lib = e.target.value;
                  setForm(f => ({
                    ...f,
                    libelle: lib,
                    // Auto-suggest the code while creating, leave it alone in edit mode
                    code: !editing && (f.code === '' || f.code === suggestCode(f.libelle)) ? suggestCode(lib) : f.code,
                  }));
                }}
                placeholder="Glycémie à jeun"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Code *</label>
              <input
                type="text"
                className="form-input"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="EXM-GLY"
                style={{ fontFamily: 'monospace' }}
                required
              />
              <div className="text-muted" style={{ fontSize: '0.6875rem', marginTop: '0.25rem' }}>
                Identifiant unique dans le système (ex: EXM-GLY, EXM-NFS).
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tarif ({branding.devise}) *</label>
              <input
                type="number"
                className="form-input"
                value={form.montant}
                onChange={e => setForm({ ...form, montant: e.target.value })}
                placeholder="0"
                min={0}
                required
              />
            </div>
            <div className="d-flex gap-1" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
              {editing && <button type="button" className="btn-secondary" onClick={startCreate}>Annuler</button>}
              <button type="submit" className="btn-primary">{editing ? 'Enregistrer' : 'Ajouter au catalogue'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
