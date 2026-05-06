import { useState, useEffect } from 'react';
import { getLocale, setLocale, availableLocales, Locale } from '../i18n';

export default function LocaleSelector() {
  const [current, setCurrent] = useState<Locale>(getLocale());

  useEffect(() => {
    const handler = () => setCurrent(getLocale());
    window.addEventListener('locale-changed', handler);
    return () => window.removeEventListener('locale-changed', handler);
  }, []);

  const handleChange = (locale: Locale) => {
    setLocale(locale);
    setCurrent(locale);
    window.location.reload(); // Reload to apply translations
  };

  return (
    <select
      value={current}
      onChange={e => handleChange(e.target.value as Locale)}
      style={{ background: 'none', border: 'none', color: '#c6c6c6', fontSize: '0.75rem', cursor: 'pointer', padding: '0.25rem' }}
      title="Langue"
    >
      {availableLocales.map(l => (
        <option key={l.code} value={l.code} style={{ color: '#161616' }}>{l.label}</option>
      ))}
    </select>
  );
}