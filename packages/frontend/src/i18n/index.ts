/**
 * Lightweight i18n. No external dep (intentional — the dictionary is small,
 * the app ships fast). Supports:
 *   - locale persistence via localStorage + system-locale fallback
 *   - reactive `useTranslation()` hook so components re-render on locale switch
 *   - `{{name}}` placeholder interpolation: t('hello', { name: 'Jean' })
 *   - graceful fallback chain: requested → fr → key (never blanks the UI)
 */

import { useState, useEffect, useCallback } from 'react';
import fr from './fr.json';
import en from './en.json';
import es from './es.json';
import pt from './pt.json';

export type Locale = 'fr' | 'en' | 'es' | 'pt';

const translations: Record<Locale, Record<string, string>> = { fr, en, es, pt };

function detectInitial(): Locale {
  const stored = localStorage.getItem('locale') as Locale | null;
  if (stored && translations[stored]) return stored;
  const sys = navigator.language?.slice(0, 2) as Locale | undefined;
  if (sys && translations[sys]) return sys;
  return 'fr';
}

let currentLocale: Locale = detectInitial();
document.documentElement.setAttribute('lang', currentLocale);

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    params[key] !== undefined ? String(params[key]) : `{{${key}}}`
  );
}

export const t = (key: string, params?: Record<string, string | number>): string => {
  const raw = translations[currentLocale]?.[key] ?? translations.fr[key] ?? key;
  return interpolate(raw, params);
};

export const setLocale = (locale: Locale): void => {
  if (!translations[locale]) return;
  currentLocale = locale;
  localStorage.setItem('locale', locale);
  document.documentElement.setAttribute('lang', locale);
  window.dispatchEvent(new Event('locale-changed'));
};

export const getLocale = (): Locale => currentLocale;

export const availableLocales: Array<{ code: Locale; label: string }> = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
];

/**
 * React hook variant. Re-renders the component when the user picks another
 * locale, so externalised strings update without a full page reload.
 */
export function useTranslation() {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const handler = () => forceRender(n => n + 1);
    window.addEventListener('locale-changed', handler);
    return () => window.removeEventListener('locale-changed', handler);
  }, []);
  const translate = useCallback((key: string, params?: Record<string, string | number>) => t(key, params), []);
  return { t: translate, locale: currentLocale, setLocale };
}
