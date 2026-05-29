import { useState, useEffect, useRef } from 'react';
import { searchCim10, type Cim10Suggestion } from '../services/api';

/**
 * Compact ICD-10 (CIM-10) typeahead. Searches both code prefix and label
 * substring server-side, debounced 200ms. Letting clinicians type "hyperten"
 * or "I10" surfaces the same suggestion ("I10 — Hypertension essentielle").
 *
 * The stored value is the bare code ("I10"), matching the existing
 * `pathologies.code_cim` column. The label appears below the field for
 * confirmation but is not persisted (resolved live from the dictionary).
 */

interface Props {
  value: string;
  onChange: (code: string, suggestion?: Cim10Suggestion) => void;
  placeholder?: string;
}

export default function Cim10Input({ value, onChange, placeholder = 'Ex: I10, hypertension…' }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Cim10Suggestion[]>([]);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  // Resolve the label for the already-set code on first render so the user
  // sees "I10 — Hypertension…" without retyping.
  useEffect(() => {
    if (!value || resolvedLabel) return;
    searchCim10(value).then(({ data }) => {
      const exact = data.find(s => s.code.toLowerCase() === value.toLowerCase());
      if (exact) setResolvedLabel(exact.libelle);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query || query.length < 1) { setSuggestions([]); return; }
    timer.current = setTimeout(() => {
      searchCim10(query).then(({ data }) => { setSuggestions(data); setHighlight(0); }).catch(() => setSuggestions([]));
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const pick = (s: Cim10Suggestion) => {
    setQuery(s.code);
    setResolvedLabel(s.libelle);
    setOpen(false);
    onChange(s.code, s);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        type="text"
        className="form-input"
        value={query}
        placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); setResolvedLabel(null); setOpen(true); onChange(e.target.value); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || suggestions.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(suggestions[highlight]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {resolvedLabel && !open && (
        <div style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
          <i className="bi bi-check-circle"></i> {resolvedLabel}
        </div>
      )}
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', left: 0, top: '100%', right: 0, marginTop: 2, background: 'var(--cds-ui-02)', border: '1px solid var(--cds-ui-03)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: '220px', overflowY: 'auto' }}>
          {suggestions.map((s, i) => (
            <div
              key={s.id}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setHighlight(i)}
              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', background: i === highlight ? 'var(--cds-ui-01)' : 'transparent', borderBottom: i < suggestions.length - 1 ? '1px solid var(--cds-ui-03)' : 'none' }}
            >
              <strong>{s.code}</strong> <span className="text-muted">— {s.libelle}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
