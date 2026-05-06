import { useState, useEffect } from 'react';
import { getFormulaires, createFormulaire, getServices } from '../services/api';
import type { Service } from '../types';

const fieldTypes = [
  { value: 'text', label: 'Texte', icon: 'bi-fonts' },
  { value: 'number', label: 'Nombre', icon: 'bi-123' },
  { value: 'date', label: 'Date', icon: 'bi-calendar' },
  { value: 'select', label: 'Liste déroulante', icon: 'bi-list' },
  { value: 'checkbox', label: 'Case à cocher', icon: 'bi-check-square' },
  { value: 'radio', label: 'Choix unique', icon: 'bi-circle' },
  { value: 'textarea', label: 'Zone de texte', icon: 'bi-text-paragraph' },
  { value: 'section', label: 'Section', icon: 'bi-layout-text-sidebar' },
];

interface FormField {
  id: string; type: string; label: string; required: boolean;
  options?: string[]; placeholder?: string; min?: number; max?: number;
  condition?: { field: string; value: string };
}

export default function FormBuilder() {
  const [formulaires, setFormulaires] = useState<any[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formService, setFormService] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [f, s] = await Promise.all([getFormulaires(), getServices()]);
      setFormulaires(f.data); setServices(s.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const addField = (type: string) => {
    setFields([...fields, { id: `field_${Date.now()}`, type, label: '', required: false, options: type === 'select' || type === 'radio' ? [''] : undefined }]);
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const removeField = (index: number) => setFields(fields.filter((_, i) => i !== index));
  const moveField = (index: number, dir: 'up' | 'down') => {
    const newFields = [...fields];
    const swap = dir === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= newFields.length) return;
    [newFields[index], newFields[swap]] = [newFields[swap], newFields[index]];
    setFields(newFields);
  };

  const handleSave = async () => {
    if (!formName || fields.length === 0) { alert('Nom et au moins un champ requis'); return; }
    try {
      await createFormulaire({ nom: formName, description: formDesc, service_id: formService || null, schema_json: fields });
      setShowBuilder(false); setFormName(''); setFormDesc(''); setFormService(''); setFields([]);
      loadData();
    } catch { alert('Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Formulaires</span></nav>
      <div className="page-header"><h1 className="page-title">Éditeur de formulaires</h1><button className="btn-primary" onClick={() => setShowBuilder(true)}><i className="bi bi-plus"></i> Nouveau formulaire</button></div>

      {!showBuilder ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {formulaires.map((f: any) => {
            const schema = typeof f.schema_json === 'string' ? JSON.parse(f.schema_json) : f.schema_json;
            return (
              <div key={f.id} className="tile" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{f.nom}</h3>
                {f.description && <p className="text-muted" style={{ fontSize: '0.8125rem' }}>{f.description}</p>}
                <div className="d-flex gap-1 mt-1">
                  <span className="tag tag-blue">{Array.isArray(schema) ? schema.length : 0} champs</span>
                  {f.service_nom && <span className="tag tag-gray">{f.service_nom}</span>}
                </div>
              </div>
            );
          })}
          {formulaires.length === 0 && <div className="table-empty" style={{ gridColumn: '1/-1' }}>Aucun formulaire</div>}
        </div>
      ) : (
        <div>
          <div className="tile mb-2" style={{ padding: '1.25rem' }}>
            <div className="grid-3">
              <div className="form-group"><label className="form-label">Nom du formulaire *</label><input type="text" className="form-input" value={formName} onChange={e => setFormName(e.target.value)} placeholder="ex: Fiche de triage" /></div>
              <div className="form-group"><label className="form-label">Service</label><select className="form-select" value={formService} onChange={e => setFormService(e.target.value)}><option value="">Tous</option>{services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Description</label><input type="text" className="form-input" value={formDesc} onChange={e => setFormDesc(e.target.value)} /></div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem' }}>
            {/* Field palette */}
            <div className="tile" style={{ padding: '1rem' }}>
              <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.75rem' }}>Ajouter un champ</h4>
              {fieldTypes.map(ft => (
                <button key={ft.value} className="btn-ghost" style={{ width: '100%', textAlign: 'left', padding: '0.5rem', marginBottom: '0.25rem', fontSize: '0.8125rem' }} onClick={() => addField(ft.value)}>
                  <i className={`bi ${ft.icon}`} style={{ marginRight: '0.5rem' }}></i>{ft.label}
                </button>
              ))}
            </div>

            {/* Form preview */}
            <div className="tile" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Champs du formulaire ({fields.length})</h4>
              {fields.length === 0 && <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>Cliquez sur un type de champ à gauche pour l'ajouter</p>}
              {fields.map((field, i) => (
                <div key={field.id} style={{ border: '1px solid var(--cds-ui-03)', padding: '0.75rem', marginBottom: '0.5rem', background: 'var(--cds-ui-01)' }}>
                  <div className="d-flex justify-between align-center mb-1">
                    <span className="tag tag-blue" style={{ fontSize: '0.6875rem' }}>{fieldTypes.find(ft => ft.value === field.type)?.label}</span>
                    <div className="d-flex gap-1">
                      <button className="btn-icon" onClick={() => moveField(i, 'up')} disabled={i === 0}><i className="bi bi-chevron-up"></i></button>
                      <button className="btn-icon" onClick={() => moveField(i, 'down')} disabled={i === fields.length - 1}><i className="bi bi-chevron-down"></i></button>
                      <button className="btn-icon" onClick={() => removeField(i)}><i className="bi bi-trash text-danger"></i></button>
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group" style={{ marginBottom: '0.5rem' }}><input type="text" className="form-input" value={field.label} onChange={e => updateField(i, { label: e.target.value })} placeholder="Libellé du champ" style={{ fontSize: '0.8125rem' }} /></div>
                    <div className="d-flex align-center gap-1"><label style={{ fontSize: '0.75rem' }}><input type="checkbox" checked={field.required} onChange={e => updateField(i, { required: e.target.checked })} /> Requis</label></div>
                  </div>
                  {(field.type === 'select' || field.type === 'radio') && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <label className="form-label" style={{ fontSize: '0.6875rem' }}>Options (une par ligne)</label>
                      <textarea className="form-textarea" rows={2} value={field.options?.join('\n')} onChange={e => updateField(i, { options: e.target.value.split('\n') })} style={{ fontSize: '0.75rem' }} />
                    </div>
                  )}
                </div>
              ))}
              {fields.length > 0 && (
                <div className="d-flex gap-1 mt-2">
                  <button className="btn-primary" onClick={handleSave}>Enregistrer le formulaire</button>
                  <button className="btn-secondary" onClick={() => { setShowBuilder(false); setFields([]); }}>Annuler</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}