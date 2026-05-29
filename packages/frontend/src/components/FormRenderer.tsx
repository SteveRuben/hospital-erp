import { useState } from 'react';
import type { FormSchema, FormField } from '../services/api';

/**
 * Renders a JSON-schema-driven form. The schema is the contract — what fields
 * exist, their types, options, required-ness. We don't trust the renderer for
 * security (the API revalidates) but we do enforce required fields client-side
 * to avoid a server round-trip on obvious mistakes.
 */

interface Props {
  schema: FormSchema;
  initial?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  disabled?: boolean;
}

export default function FormRenderer({ schema, initial, onSubmit, onCancel, submitLabel = 'Enregistrer', disabled }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(initial ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const setField = (id: string, v: unknown) => setValues(prev => ({ ...prev, [id]: v }));
  const markTouched = (id: string) => setTouched(prev => ({ ...prev, [id]: true }));

  const missing = schema.fields.filter(f => f.required && (values[f.id] === undefined || values[f.id] === null || values[f.id] === ''));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missing.length > 0) {
      const t: Record<string, boolean> = {};
      for (const f of missing) t[f.id] = true;
      setTouched(prev => ({ ...prev, ...t }));
      return;
    }
    setSubmitting(true);
    try { await onSubmit(values); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit}>
      {schema.fields.map(f => (
        <FieldInput key={f.id} field={f} value={values[f.id]} onChange={(v) => setField(f.id, v)} onBlur={() => markTouched(f.id)} touched={!!touched[f.id]} disabled={disabled || submitting} />
      ))}
      <div className="d-flex gap-1 mt-2" style={{ justifyContent: 'flex-end' }}>
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>Annuler</button>}
        <button type="submit" className="btn-primary" disabled={disabled || submitting}>{submitting ? '…' : submitLabel}</button>
      </div>
    </form>
  );
}

function FieldInput({ field, value, onChange, onBlur, touched, disabled }: { field: FormField; value: unknown; onChange: (v: unknown) => void; onBlur: () => void; touched: boolean; disabled?: boolean }) {
  const invalid = touched && field.required && (value === undefined || value === null || value === '');
  const errorStyle = invalid ? { borderColor: 'var(--cds-support-error)' } : undefined;

  return (
    <div className="form-group">
      <label className="form-label">
        {field.label}
        {field.required && <span style={{ color: 'var(--cds-support-error)' }}> *</span>}
      </label>
      {field.type === 'text' && (
        <input type="text" className="form-input" style={errorStyle} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={field.placeholder} disabled={disabled} />
      )}
      {field.type === 'textarea' && (
        <textarea className="form-textarea" rows={3} style={errorStyle} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={field.placeholder} disabled={disabled} />
      )}
      {field.type === 'number' && (
        <input type="number" className="form-input" style={errorStyle} value={typeof value === 'number' ? value : (typeof value === 'string' ? value : '')} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} onBlur={onBlur} placeholder={field.placeholder} disabled={disabled} />
      )}
      {field.type === 'date' && (
        <input type="date" className="form-input" style={errorStyle} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} onBlur={onBlur} disabled={disabled} />
      )}
      {field.type === 'boolean' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} disabled={disabled} />
          {field.placeholder ?? 'Oui'}
        </label>
      )}
      {field.type === 'select' && (
        <select className="form-select" style={errorStyle} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} onBlur={onBlur} disabled={disabled}>
          <option value="">{field.placeholder ?? '— Choisir —'}</option>
          {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      )}
      {invalid && <div style={{ color: 'var(--cds-support-error)', fontSize: '0.6875rem', marginTop: '0.25rem' }}>Ce champ est requis</div>}
    </div>
  );
}
