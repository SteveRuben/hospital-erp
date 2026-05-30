import { useState, useEffect, useRef } from 'react';
import { searchPatientsForOrdering } from '../services/api';

/**
 * Reusable patient typeahead. Replaces the all-patients <select> pattern
 * we had across Visites, RDV, ExamenForm, Imagerie, Facturation, Orders,
 * Consultations, Admissions, Programmes, ListesPatients, Finances and
 * FileAttente. Centralising it gives every screen the same UX (search by
 * name / prénom / referenceId / phone) and avoids re-loading thousands of
 * patient rows just to render a dropdown.
 *
 * Uses /patients/search/ordering — bypasses the medecin-attribution filter
 * because these are operational flows (a laborantin or réceptionniste
 * needs to be able to find any patient to register a service).
 */

export interface PatientSuggestion {
  id: number;
  nom: string;
  prenom: string;
  telephone?: string | null;
  referenceId?: string | null;
}

interface Props {
  value: string;                       // patient id as string ('' = nothing picked)
  onChange: (id: string, patient?: PatientSuggestion) => void;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Pre-fill the visible text when editing an existing record. */
  initialLabel?: string;
  /** Optional className override on the wrapper. */
  className?: string;
}

export default function PatientTypeahead({
  value, onChange, required, placeholder, autoFocus, initialLabel, className,
}: Props) {
  const [query, setQuery] = useState(initialLabel ?? '');
  const [results, setResults] = useState<PatientSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync the visible text if the parent updates initialLabel after mount
  // (e.g. async load of an existing record).
  useEffect(() => {
    if (initialLabel !== undefined) setQuery(initialLabel);
  }, [initialLabel]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query || query.length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      searchPatientsForOrdering(query)
        .then(({ data }) => { setResults(data as PatientSuggestion[]); setHighlight(0); })
        .catch(() => setResults([]));
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  const pick = (p: PatientSuggestion) => {
    setQuery(`${p.prenom} ${p.nom}`.trim());
    setOpen(false);
    onChange(String(p.id), p);
  };

  return (
    <div className={className} style={{ position: 'relative' }}>
      <input
        type="text"
        className="form-input"
        value={query}
        placeholder={placeholder ?? 'Tapez 2 lettres du nom, prénom ou référence (PAT-…)'}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          // Drop the previously-picked id whenever the user re-types — forces
          // them to re-pick from the list. Prevents stale id + new text mismatch.
          if (value) onChange('', undefined);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(results[highlight]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        required={required && !value}
        autoFocus={autoFocus}
      />
      {value && (
        <div className="text-muted" style={{ fontSize: '0.6875rem', marginTop: '0.25rem' }}>
          <i className="bi bi-check-circle"></i> patient sélectionné (#{value})
        </div>
      )}
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2, background: 'var(--cds-ui-02)', border: '1px solid var(--cds-ui-03)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: '260px', overflowY: 'auto' }}>
          {results.map((p, i) => (
            <div
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setHighlight(i)}
              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', borderBottom: i < results.length - 1 ? '1px solid var(--cds-ui-03)' : 'none', background: i === highlight ? 'var(--cds-ui-01)' : 'transparent' }}
            >
              <strong>{p.prenom} {p.nom}</strong>
              {p.referenceId && <span className="text-muted" style={{ marginLeft: '0.5rem' }}>{p.referenceId}</span>}
              {p.telephone && <span className="text-muted" style={{ marginLeft: '0.5rem' }}>{p.telephone}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
