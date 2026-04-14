import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { quickSearchPatients } from '../services/api';

export default function PatientSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.length < 2) { setResults([]); setShow(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await quickSearchPatients(value);
        setResults(data);
        setShow(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
  };

  const handleSelect = (id: number) => { setShow(false); setQuery(''); navigate(`/app/patients/${id}`); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { setShow(false); navigate(`/app/recherche?q=${encodeURIComponent(query)}`); } };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 1, maxWidth: '400px', margin: '0 2rem' }}>
      <div className="header-search" style={{ margin: 0 }}>
        <i className="bi bi-search"></i>
        <input type="text" placeholder="Rechercher un patient..." value={query} onChange={e => handleChange(e.target.value)} onFocus={() => results.length > 0 && setShow(true)} onKeyDown={handleKeyDown} />
      </div>
      {show && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--cds-ui-03)', zIndex: 300, maxHeight: '400px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {loading && <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--cds-text-secondary)', fontSize: '0.8125rem' }}>Recherche...</div>}
          {!loading && results.length === 0 && <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--cds-text-secondary)', fontSize: '0.8125rem' }}>Aucun résultat</div>}
          {results.map(p => (
            <div key={p.id} onClick={() => handleSelect(p.id)} style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--cds-ui-03)', display: 'flex', alignItems: 'center', gap: '0.75rem' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cds-hover-row)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--cds-ui-03)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{p.sexe === 'M' ? '♂' : p.sexe === 'F' ? '♀' : '?'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--cds-text-primary)' }}>{p.prenom} {p.nom}</div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>#{p.id} {p.telephone ? `• ${p.telephone}` : ''} {p.ville ? `• ${p.ville}` : ''}</div>
              </div>
            </div>
          ))}
          <div onClick={() => { setShow(false); navigate(`/app/recherche?q=${encodeURIComponent(query)}`); }} style={{ padding: '0.5rem 0.75rem', textAlign: 'center', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--cds-interactive)', borderTop: '1px solid var(--cds-ui-03)' }}>
            Recherche avancée →
          </div>
        </div>
      )}
    </div>
  );
}