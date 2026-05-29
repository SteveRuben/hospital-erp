import { useState, useEffect } from 'react';
import { useSnackbar } from '../components/Snackbar';
import { useConfirm } from '../components/ConfirmDialog';
import FormRenderer from '../components/FormRenderer';
import { listFormulaires, createFormulaire, updateFormulaire, deleteFormulaire, type Formulaire, type FormField, type FormFieldType, type FormSchema } from '../services/api';

/**
 * Admin page for the dynamic forms feature.
 *
 * Left: list of existing forms.
 * Right: builder for the selected form — name/description + field rows you
 * add, reorder, edit, delete. The builder serialises into the same JSON
 * schema FormRenderer consumes, so the live preview at the bottom is
 * exactly what end-users will see.
 */

const TYPE_OPTIONS: Array<{ value: FormFieldType; label: string }> = [
  { value: 'text', label: 'Texte court' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'number', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Case à cocher' },
  { value: 'select', label: 'Liste déroulante' },
];

const emptyForm = (): { id: number | null; nom: string; description: string; actif: boolean; fields: FormField[] } => ({
  id: null, nom: '', description: '', actif: true, fields: [],
});

export default function Formulaires() {
  const { showSnackbar } = useSnackbar();
  const { confirm } = useConfirm();
  const [forms, setForms] = useState<Formulaire[]>([]);
  const [draft, setDraft] = useState(emptyForm());
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { const { data } = await listFormulaires(); setForms(data); }
    catch { showSnackbar('Erreur de chargement', 'error'); }
    finally { setLoading(false); }
  };

  const select = (f: Formulaire) => {
    setDraft({
      id: f.id, nom: f.nom, description: f.description ?? '', actif: f.actif,
      fields: f.schema?.fields ?? [],
    });
  };

  const reset = () => setDraft(emptyForm());

  const addField = () => {
    const idx = draft.fields.length + 1;
    setDraft({ ...draft, fields: [...draft.fields, { id: `champ_${idx}`, label: `Champ ${idx}`, type: 'text' }] });
  };
  const updateField = (i: number, patch: Partial<FormField>) => {
    const fields = draft.fields.slice();
    fields[i] = { ...fields[i], ...patch } as FormField;
    setDraft({ ...draft, fields });
  };
  const removeField = (i: number) => {
    setDraft({ ...draft, fields: draft.fields.filter((_, j) => j !== i) });
  };
  const moveField = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.fields.length) return;
    const fields = draft.fields.slice();
    [fields[i], fields[j]] = [fields[j], fields[i]];
    setDraft({ ...draft, fields });
  };

  const save = async () => {
    if (!draft.nom.trim()) { showSnackbar('Nom du formulaire requis', 'warning'); return; }
    if (draft.fields.length === 0) { showSnackbar('Ajoutez au moins un champ', 'warning'); return; }
    const schema: FormSchema = { fields: draft.fields };
    try {
      if (draft.id == null) {
        const { data } = await createFormulaire({ nom: draft.nom.trim(), description: draft.description.trim() || undefined, schema });
        showSnackbar('Formulaire créé', 'success');
        setDraft({ id: data.id, nom: data.nom, description: data.description ?? '', actif: data.actif, fields: data.schema?.fields ?? draft.fields });
      } else {
        await updateFormulaire(draft.id, { nom: draft.nom.trim(), description: draft.description.trim(), actif: draft.actif, schema });
        showSnackbar('Formulaire mis à jour', 'success');
      }
      load();
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur', 'error');
    }
  };

  const handleDelete = async (id: number, nom: string) => {
    const ok = await confirm({ title: 'Supprimer le formulaire', message: `Supprimer "${nom}" ? Les réponses déjà enregistrées resteront orphelines.`, confirmLabel: 'Supprimer', variant: 'danger' });
    if (!ok) return;
    try { await deleteFormulaire(id); showSnackbar('Supprimé', 'success'); if (draft.id === id) reset(); load(); }
    catch { showSnackbar('Erreur', 'error'); }
  };

  const previewSchema: FormSchema = { fields: draft.fields };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Formulaires</span></nav>
      <div className="page-header"><h1 className="page-title">Formulaires dynamiques</h1></div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem' }}>
        {/* Sidebar */}
        <div className="tile" style={{ padding: '0.75rem' }}>
          <div className="d-flex justify-between align-center mb-1">
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Mes formulaires</h3>
            <button className="btn-primary btn-sm" onClick={reset}><i className="bi bi-plus"></i> Nouveau</button>
          </div>
          {loading && <div className="text-muted" style={{ fontSize: '0.75rem' }}>Chargement…</div>}
          {!loading && forms.length === 0 && <div className="text-muted" style={{ fontSize: '0.75rem' }}>Aucun formulaire — créez le premier.</div>}
          {forms.map(f => (
            <div key={f.id} onClick={() => select(f)} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', background: draft.id === f.id ? 'var(--cds-interactive)' : 'transparent', color: draft.id === f.id ? '#fff' : 'inherit', fontSize: '0.8125rem', marginBottom: '0.125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nom}</span>
                {!f.actif && <span style={{ fontSize: '0.625rem', opacity: 0.7 }}>inactif</span>}
              </div>
              <div style={{ fontSize: '0.6875rem', opacity: 0.7 }}>{f.schema?.fields?.length ?? 0} champs</div>
            </div>
          ))}
        </div>

        {/* Builder */}
        <div>
          <div className="tile mb-2" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>{draft.id == null ? 'Nouveau formulaire' : `Édition — ${draft.nom || '(sans nom)'}`}</h3>
            <div className="form-group"><label className="form-label">Nom *</label><input className="form-input" value={draft.nom} onChange={e => setDraft({ ...draft, nom: e.target.value })} placeholder="Ex: Anamnèse cardiologie" /></div>
            <div className="form-group"><label className="form-label">Description</label><input className="form-input" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
            {draft.id != null && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                <input type="checkbox" checked={draft.actif} onChange={e => setDraft({ ...draft, actif: e.target.checked })} /> Formulaire actif
              </label>
            )}
          </div>

          <div className="tile mb-2" style={{ padding: '1.5rem' }}>
            <div className="d-flex justify-between align-center mb-2">
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Champs</h3>
              <button className="btn-primary btn-sm" onClick={addField}><i className="bi bi-plus"></i> Ajouter un champ</button>
            </div>
            {draft.fields.length === 0 && <div className="text-muted" style={{ fontSize: '0.8125rem', padding: '1rem 0' }}>Aucun champ — cliquez sur "Ajouter un champ".</div>}
            {draft.fields.map((f, i) => (
              <div key={i} className="tile mb-1" style={{ padding: '0.75rem', background: 'var(--cds-ui-01)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px auto', gap: '0.5rem', alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Libellé</label>
                    <input className="form-input" value={f.label} onChange={e => updateField(i, { label: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Identifiant (code)</label>
                    <input className="form-input" value={f.id} onChange={e => updateField(i, { id: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 50) })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Type</label>
                    <select className="form-select" value={f.type} onChange={e => updateField(i, { type: e.target.value as FormFieldType })}>
                      {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="d-flex gap-1">
                    <button className="btn-icon" title="Monter" onClick={() => moveField(i, -1)} disabled={i === 0}><i className="bi bi-arrow-up"></i></button>
                    <button className="btn-icon" title="Descendre" onClick={() => moveField(i, 1)} disabled={i === draft.fields.length - 1}><i className="bi bi-arrow-down"></i></button>
                    <button className="btn-icon" title="Supprimer" onClick={() => removeField(i)}><i className="bi bi-trash"></i></button>
                  </div>
                </div>
                <div className="d-flex gap-2 mt-1" style={{ alignItems: 'center', fontSize: '0.8125rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <input type="checkbox" checked={f.required ?? false} onChange={e => updateField(i, { required: e.target.checked })} /> Requis
                  </label>
                  {f.type === 'select' && (
                    <div style={{ flex: 1 }}>
                      <input className="form-input" placeholder="Options séparées par virgule" value={(f.options ?? []).join(', ')} onChange={e => updateField(i, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })} />
                    </div>
                  )}
                  {(f.type === 'text' || f.type === 'textarea' || f.type === 'number') && (
                    <div style={{ flex: 1 }}>
                      <input className="form-input" placeholder="Placeholder" value={f.placeholder ?? ''} onChange={e => updateField(i, { placeholder: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="d-flex gap-1 mt-2" style={{ justifyContent: 'flex-end' }}>
              {draft.id != null && <button className="btn-secondary" onClick={() => handleDelete(draft.id!, draft.nom)}><i className="bi bi-trash"></i> Supprimer</button>}
              <button className="btn-primary" onClick={save}><i className="bi bi-save"></i> Enregistrer</button>
            </div>
          </div>

          {draft.fields.length > 0 && (
            <div className="tile" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Aperçu</h3>
              <FormRenderer schema={previewSchema} onSubmit={async () => { /* preview only */ }} submitLabel="Aperçu — soumission désactivée" disabled />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
