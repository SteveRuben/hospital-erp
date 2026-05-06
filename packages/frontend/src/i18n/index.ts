import fr from './fr.json';
import en from './en.json';

export type Locale = 'fr' | 'en';

const translations: Record<Locale, Record<string, string>> = { fr, en };

let currentLocale: Locale = (localStorage.getItem('locale') as Locale) || 'fr';

export const t = (key: string): string => {
  return translations[currentLocale]?.[key] || translations.fr[key] || key;
};

export const setLocale = (locale: Locale): void => {
  currentLocale = locale;
  localStorage.setItem('locale', locale);
  window.dispatchEvent(new Event('locale-changed'));
};

export const getLocale = (): Locale => currentLocale;

export const availableLocales: Array<{ code: Locale; label: string }> = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
];